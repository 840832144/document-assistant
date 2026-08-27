import { Services } from '../src/services.js';

const services = new Services();
const result = await services.getDocumentationHub().initializeHistoricalDocuments();

process.stdout.write(
  `${JSON.stringify(
    {
      hub_title: result.hub_title,
      hub_url: result.hub_url,
      registered_documents: result.registered_documents,
      scanned: result.scanned,
      excluded_temporary: result.excluded_temporary,
      unique_links: result.unique_links,
      readback_verified: result.readback_verified,
    },
    null,
    2,
  )}\n`,
);
