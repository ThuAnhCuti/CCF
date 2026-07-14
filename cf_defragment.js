import {
  defragmentZeroTrustLists,
  upsertZeroTrustDNSRule,
  upsertZeroTrustSNIRule,
  deleteZeroTrustListsOneByOne,
} from './lib/api.js';
import { BLOCK_BASED_ON_SNI } from './lib/constants.js';
import { notifyWebhook } from './lib/utils.js';

try {
  // Defragment the lists and rewrite the rules
  const { emptyLists, nonEmptyLists, stats } = await defragmentZeroTrustLists();

  // If we don't have any empty lists, there's no change to the rules
  if (emptyLists.length > 0) {
    console.log('Updating rules...');
    // We have any empty lists, first rewrite the rule(s) using the non-empty lists
    await upsertZeroTrustDNSRule(nonEmptyLists, 'CGPS Filter Lists');

    // Optionally create a rule that matches the SNI.
    // This only works for users who proxy their traffic through Cloudflare.
    if (BLOCK_BASED_ON_SNI) {
      await upsertZeroTrustSNIRule(nonEmptyLists, 'CGPS Filter Lists - SNI Based Filtering');
    }

    // Now the lists are no longer referenced, we can delete them
    console.log('Deleting empty lists...');
    await deleteZeroTrustListsOneByOne(emptyLists);
  }

  // Print a summary of what we did
  console.log(`Defragmented ${stats.chunks} lists into ${stats.assignedLists} lists`);
  console.log(`Patches made to ${stats.patches} lists, moving ${stats.entriesToMove} entries`);

  // Continue summary if we deletes lists or rewrote rules
  if (emptyLists.length > 0) {
    console.log(`Updated rules using ${stats.nonEmptyLists} lists`);
    console.log(`Deleted ${stats.emptyLists} empty lists`);
  }

  // Send a notification to the webhook
  await notifyWebhook('CF Defragment script finished running');
  console.log('Script completed successfully.');
} catch (error) {
  console.error('Fatal error during defragmentation:', error);
  console.error(
    'Note: rules may have been updated but old lists not yet deleted. Check Cloudflare dashboard and re-run if needed.'
  );
  try {
    await notifyWebhook(`CF Defragment script FAILED: ${error}`);
  } catch (webhookErr) {
    console.error('Additionally failed to send failure webhook:', webhookErr);
  }
  process.exit(1);
}
