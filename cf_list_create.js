import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { synchronizeZeroTrustLists } from './lib/api.js';
import { DRY_RUN, LIST_ITEM_LIMIT, LIST_ITEM_SIZE, PROCESSING_FILENAME } from './lib/constants.js';
import {
  buildAllowSet,
  createSmartBlockSet,
  notifyWebhook,
  readFile,
} from './lib/utils.js';

const allowlistFilename = existsSync(PROCESSING_FILENAME.OLD_ALLOWLIST)
  ? PROCESSING_FILENAME.OLD_ALLOWLIST
  : PROCESSING_FILENAME.ALLOWLIST;
const blocklistFilename = existsSync(PROCESSING_FILENAME.OLD_BLOCKLIST)
  ? PROCESSING_FILENAME.OLD_BLOCKLIST
  : PROCESSING_FILENAME.BLOCKLIST;

try {
  // Check if the blocklist.txt and allowlist.txt files exist
  for (const filename of [allowlistFilename, blocklistFilename]) {
    if (!existsSync(filename)) {
      console.error(
        `File not found: ${filename}. Please create a block/allowlist first, or run download_lists.js to download the recommended lists.`
      );
      process.exit(1);
    }
  }

  // Đọc allowlist trước, dùng để loại trừ domain (và mọi domain con) khỏi blocklist.
  // buildAllowSet dùng normalizeLine nên hỗ trợ đầy đủ format: hosts-file,
  // AdBlock (||domain^), wildcard (*.domain), plain domain, và strip comment.
  console.log(`Processing ${allowlistFilename}`);
  const allowSet = await buildAllowSet(resolve(`./${allowlistFilename}`));
  console.log(`Loaded ${allowSet.size} allowlisted domains`);

  // createSmartBlockSet thực hiện dedup + parent-domain pruning:
  // nếu example.com đã bị chặn, mọi *.example.com được thêm sau sẽ tự động
  // bị bỏ qua (redundant); nếu example.com được thêm SAU *.example.com,
  // các subdomain con thừa sẽ bị dọn dẹp (pruned) khỏi tập kết quả.
  // Điều này đảm bảo 300k slot chứa domain tối ưu nhất, không lãng phí vào
  // các subdomain đã được bao phủ bởi một rule rộng hơn.
  const blockSet = createSmartBlockSet(allowSet);

  let processedDomainCount = 0;
  let skippedInvalidCount = 0;
  let limitReached = false;

  console.log(`Processing ${blocklistFilename}`);
  await readFile(resolve(`./${blocklistFilename}`), (line, rl) => {
    if (limitReached) return;

    const domain = normalizeLine(line);

    if (!domain) {
      skippedInvalidCount++;
      return;
    }

    processedDomainCount++;
    blockSet.add(domain);

    if (blockSet.size() === LIST_ITEM_LIMIT) {
      console.log('Maximum number of blocked domains reached - Stopping processing blocklist...');
      limitReached = true;
      rl.close();
    }
  });

  const domains = blockSet.getAll();
  const numberOfLists = Math.ceil(domains.length / LIST_ITEM_SIZE);

  console.log('\n\n');
  console.log(`Number of lines processed: ${processedDomainCount}`);
  console.log(`Number of invalid/comment lines skipped: ${skippedInvalidCount}`);
  console.log(`Number of unique domains after smart dedup+pruning: ${domains.length}`);
  console.log(`Number of lists to be created: ${numberOfLists}`);
  console.log('\n\n');

  if (DRY_RUN) {
    console.log(
      'Dry run complete - no lists were created. If this was not intended, please remove the DRY_RUN environment variable and try again.'
    );
  } else {
    console.log(`Creating ${numberOfLists} lists for ${domains.length} domains...`);

    await synchronizeZeroTrustLists(domains);
    await notifyWebhook(
      `CF List Create script finished running (${domains.length} domains, ${numberOfLists} lists)`
    );
    console.log('Script completed successfully.');
  }
} catch (error) {
  console.error('Fatal error during list creation:', error);
  try {
    await notifyWebhook(`CF List Create script FAILED: ${error}`);
  } catch (webhookErr) {
    console.error('Additionally failed to send failure webhook:', webhookErr);
  }
  process.exit(1);
}

