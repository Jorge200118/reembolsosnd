import { describe, it, expect, afterEach, vi } from "vitest";
import { pushSoportado, esIOS } from "./soporte";

afterEach(() => vi.unstubAllGlobals());

describe("soporte push", () => {
  it("pushSoportado true con todas las APIs", () => {
    vi.stubGlobal("navigator", { serviceWorker: {}, userAgent: "x", platform: "x", maxTouchPoints: 0 });
    vi.stubGlobal("window", { PushManager: function () {}, Notification: function () {} });
    expect(pushSoportado()).toBe(true);
  });

  it("pushSoportado false sin PushManager", () => {
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("window", { Notification: function () {} });
    expect(pushSoportado()).toBe(false);
  });

  it("esIOS detecta iPhone", () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 });
    expect(esIOS()).toBe(true);
  });

  it("esIOS false en Android", () => {
    vi.stubGlobal("navigator", { userAgent: "Linux; Android 13", platform: "Linux armv8l", maxTouchPoints: 5 });
    expect(esIOS()).toBe(false);
  });
});
