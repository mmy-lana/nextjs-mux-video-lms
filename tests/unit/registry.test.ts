/**
 * The asset-deletion capability.
 *
 * Deleting a Mux asset is not reversible from the app and reaches outside it.
 * These tests pin the property that makes it safe: an asset id authorises
 * nothing on its own, and a capability issued for one asset cannot be replayed
 * against another.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  REGISTRY_TTL_MS,
  bindAssetToUpload,
  isRegisteredAsset,
  issueDeleteCapability,
  registrySize,
  resetRegistry,
  verifyDeleteCapability,
} from "@/lib/mux/registry";

const UPLOAD = "upl_test";
const ASSET = "ast_test";

describe("delete capability", () => {
  beforeEach(() => {
    resetRegistry();
  });

  it("mints a long random token, distinct per upload", () => {
    const first = issueDeleteCapability("upl_a");
    const second = issueDeleteCapability("upl_b");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  it("refuses to verify before an asset is bound to its upload", () => {
    const token = issueDeleteCapability(UPLOAD);

    // The upload exists but Mux has not yet revealed the asset id.
    expect(isRegisteredAsset(ASSET)).toBe(false);
    expect(verifyDeleteCapability(ASSET, token)).toBe(false);
  });

  it("accepts the token issued for the asset's own upload", () => {
    const token = issueDeleteCapability(UPLOAD);
    bindAssetToUpload(UPLOAD, ASSET);

    expect(verifyDeleteCapability(ASSET, token)).toBe(true);
  });

  it("refuses a token issued for a different upload", () => {
    const mine = issueDeleteCapability("upl_mine");
    const theirs = issueDeleteCapability("upl_theirs");
    bindAssetToUpload("upl_mine", ASSET);
    bindAssetToUpload("upl_theirs", "ast_theirs");

    expect(verifyDeleteCapability(ASSET, theirs)).toBe(false);
    expect(verifyDeleteCapability(ASSET, mine)).toBe(true);
  });

  it("refuses an unknown asset even with a valid token", () => {
    const token = issueDeleteCapability(UPLOAD);
    bindAssetToUpload(UPLOAD, ASSET);

    expect(verifyDeleteCapability("ast_someone_elses", token)).toBe(false);
  });

  it("refuses a missing, empty or malformed token", () => {
    const token = issueDeleteCapability(UPLOAD);
    bindAssetToUpload(UPLOAD, ASSET);

    expect(verifyDeleteCapability(ASSET, null)).toBe(false);
    expect(verifyDeleteCapability(ASSET, undefined)).toBe(false);
    expect(verifyDeleteCapability(ASSET, "")).toBe(false);
    expect(verifyDeleteCapability(ASSET, token.toUpperCase())).toBe(false);
  });

  it("stops verifying once the entry has expired", () => {
    const now = 1_000_000;
    const token = issueDeleteCapability(UPLOAD, now);
    bindAssetToUpload(UPLOAD, ASSET, now);

    expect(verifyDeleteCapability(ASSET, token, now + REGISTRY_TTL_MS - 1)).toBe(true);
    expect(verifyDeleteCapability(ASSET, token, now + REGISTRY_TTL_MS + 1)).toBe(false);
  });

  it("drops expired entries, so the registry cannot grow without bound", () => {
    const now = 1_000_000;

    for (let index = 0; index < 50; index += 1) {
      const uploadId = `upl_${index}`;
      issueDeleteCapability(uploadId, now);
      bindAssetToUpload(uploadId, `ast_${index}`, now);
    }

    expect(registrySize(now)).toBe(50);

    const muchLater = now + REGISTRY_TTL_MS * 2;
    expect(registrySize(muchLater)).toBe(0);
  });

  it("re-points an asset id when the upload is re-bound", () => {
    const original = issueDeleteCapability("upl_first");
    const replacement = issueDeleteCapability("upl_second");

    bindAssetToUpload("upl_first", ASSET);
    expect(verifyDeleteCapability(ASSET, original)).toBe(true);

    // Mux retried and produced a different asset for the same upload.
    bindAssetToUpload("upl_first", "ast_retry");
    expect(isRegisteredAsset(ASSET)).toBe(false);
    expect(verifyDeleteCapability(ASSET, original)).toBe(false);

    bindAssetToUpload("upl_second", ASSET);
    expect(verifyDeleteCapability(ASSET, replacement)).toBe(true);
  });
});