import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError, describeConfig, hasSessionCredentials, loadConfig } from "./config.js";

const base = { PAGECRAFT_API_URL: "https://api.example.test/" };

describe("config", () => {
  it("requires an API URL", () => {
    assert.throws(() => loadConfig({}), (err: Error) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /PAGECRAFT_API_URL is required/);
      return true;
    });
  });

  it("requires the URL to be http(s), not a bare host", () => {
    assert.throws(
      () => loadConfig({ PAGECRAFT_API_URL: "api.example.test", PAGECRAFT_API_KEY: "k" }),
      /must start with http/
    );
  });

  it("refuses to start with no credentials at all", () => {
    assert.throws(() => loadConfig(base), /No credentials/);
  });

  it("refuses half an account sign-in", () => {
    assert.throws(() => loadConfig({ ...base, PAGECRAFT_EMAIL: "a@b.test" }), /PASSWORD is not/);
    assert.throws(() => loadConfig({ ...base, PAGECRAFT_PASSWORD: "x" }), /EMAIL is not/);
  });

  it("accepts a content key alone", () => {
    const config = loadConfig({ ...base, PAGECRAFT_API_KEY: "pk_test" });
    assert.equal(config.apiKey, "pk_test");
    assert.equal(hasSessionCredentials(config), false);
  });

  it("accepts an account sign-in alone, and trims the trailing slash", () => {
    const config = loadConfig({ ...base, PAGECRAFT_EMAIL: "a@b.test", PAGECRAFT_PASSWORD: "x" });
    assert.equal(config.apiUrl, "https://api.example.test");
    assert.equal(hasSessionCredentials(config), true);
  });

  it("treats an access token as a session credential", () => {
    const config = loadConfig({ ...base, PAGECRAFT_ACCESS_TOKEN: "tok" });
    assert.equal(hasSessionCredentials(config), true);
  });

  it("treats blank env values as absent", () => {
    assert.throws(() => loadConfig({ ...base, PAGECRAFT_API_KEY: "   " }), /No credentials/);
  });

  it("reads the read-only switch loosely", () => {
    const on = (value: string) =>
      loadConfig({ ...base, PAGECRAFT_API_KEY: "k", PAGECRAFT_READ_ONLY: value }).readOnly;
    assert.equal(on("1"), true);
    assert.equal(on("TRUE"), true);
    assert.equal(on("yes"), true);
    assert.equal(on("0"), false);
    assert.equal(on(""), false);
  });

  it("never puts a secret in the startup banner", () => {
    const banner = describeConfig(
      loadConfig({
        ...base,
        PAGECRAFT_API_KEY: "pk_super_secret",
        PAGECRAFT_EMAIL: "owner@example.test",
        PAGECRAFT_PASSWORD: "hunter2",
        PAGECRAFT_PROJECT_ID: "proj_1",
      })
    );
    assert.doesNotMatch(banner, /pk_super_secret/);
    assert.doesNotMatch(banner, /hunter2/);
    assert.doesNotMatch(banner, /owner@/);
    assert.match(banner, /o\*\*\*@example\.test/);
    assert.match(banner, /content key: set/);
    assert.match(banner, /proj_1/);
  });

  it("says so when it is read-only", () => {
    const banner = describeConfig(loadConfig({ ...base, PAGECRAFT_API_KEY: "k", PAGECRAFT_READ_ONLY: "1" }));
    assert.match(banner, /READ-ONLY/);
  });
});
