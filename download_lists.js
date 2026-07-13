import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  LIST_TYPE,
  PROCESSING_FILENAME,
  RECOMMENDED_ALLOWLIST_URLS,
  RECOMMENDED_BLOCKLIST_URLS,
  USER_DEFINED_ALLOWLIST_URLS,
  USER_DEFINED_BLOCKLIST_URLS,
} from './lib/constants.js';
import { downloadFiles } from './lib/utils.js';

type URLList = string[];

const allowlistUrls: URLList =
  USER_DEFINED_ALLOWLIST_URLS.length > 0
    ? USER_DEFINED_ALLOWLIST_URLS
    : RECOMMENDED_ALLOWLIST_URLS;
const blocklistUrls: URLList =
  USER_DEFINED_BLOCKLIST_URLS.length > 0
    ? USER_DEFINED_BLOCKLIST_URLS
    : RECOMMENDED_BLOCKLIST_URLS;

const listType = process.argv[2] as string | undefined;

async function downloadLists(filename: string, urls: URLList): Promise<void> {
  // Sử dụng process.cwd() để file được tạo ở thư mục làm việc hiện tại
  const filePath = resolve(process.cwd(), filename);

  try {
    // Hàm downloadFiles sẽ tự động ghi đè file, không cần xóa trước
    await downloadFiles(filePath, urls);

    console.log(
      `Done. The ${filename} file contains merged data from the following list(s):`
    );
    console.log(urls.map((url, i) => `${i + 1}. ${url}`).join('\n'));
  } catch (err) {
    console.error(`An error occurred while processing ${filename}:\n`, err);
    console.error('URLs:\n', urls);
    throw err;
  }
}

// Top-level async wrapper để tránh lỗi unresolved promise
(async () => {
  switch (listType) {
    case LIST_TYPE.ALLOWLIST:
      await downloadLists(PROCESSING_FILENAME.ALLOWLIST, allowlistUrls);
      break;
    case LIST_TYPE.BLOCKLIST:
      await downloadLists(PROCESSING_FILENAME.BLOCKLIST, blocklistUrls);
      break;
    default:
      await Promise.all([
        downloadLists(PROCESSING_FILENAME.ALLOWLIST, allowlistUrls),
        downloadLists(PROCESSING_FILENAME.BLOCKLIST, blocklistUrls),
      ]);
  }
})();
