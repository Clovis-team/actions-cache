import * as cache from "@actions/cache";
import * as utils from "@actions/cache/lib/internal/cacheUtils";
import { extractTar, listTar } from "@actions/cache/lib/internal/tar";
import * as core from "@actions/core";
import * as path from "path";
import {
  findObject,
  formatSize,
  getInputAsArray,
  getInputAsBoolean,
  newMinio,
  setCacheHitOutput,
  saveMatchedKey,
} from "./utils";

process.on("uncaughtException", (e) => core.info("warning: " + e.message));

async function restoreCache() {
  try {
    const bucket = core.getInput("bucket", { required: true });
    const key = core.getInput("key", { required: true });
    const useFallback = getInputAsBoolean("use-fallback");
    const paths = getInputAsArray("path");
    const restoreKeys = getInputAsArray("restore-keys");

    try {
      const mc = newMinio();

      const compressionMethod = await utils.getCompressionMethod();
      const cacheFileName = utils.getCacheFileName(compressionMethod);
      const archivePath = path.join(
        await utils.createTempDirectory(),
        cacheFileName
      );
      const keys = [key, ...restoreKeys];

      const { item: obj, matchingKey } = await findObject(mc, bucket, keys, compressionMethod);
      core.debug("found cache object");
      saveMatchedKey(matchingKey);
      core.info(
        `Downloading cache from s3 to ${archivePath}. bucket: ${bucket}, object: ${obj.name}`
      );
      await mc.fGetObject(bucket, obj.name, archivePath);

      if (core.isDebug()) {
        await listTar(archivePath, compressionMethod);
      }

      core.info(`Cache Size: ${formatSize(obj.size)} (${obj.size} bytes)`);

      await extractTar(archivePath, compressionMethod);
      setCacheHitOutput(true);
      core.info("Cache restored from s3 successfully");
    } catch (e) {
      core.info("Restore s3 cache failed: " + e.message);
      setCacheHitOutput(false);
      if (useFallback) {
        core.info("Restore cache using fallback cache");
        if (await cache.restoreCache(paths, key, restoreKeys)) {
          setCacheHitOutput(true);
          core.info("Fallback cache restored successfully");
        } else {
          core.info("Fallback cache restore failed");
        }
      }
    }
  } catch (e) {
    core.setFailed(e.message);
  }
}

restoreCache();
