import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "./suscribir";

describe("urlBase64ToUint8Array", () => {
  it("decodifica base64url sin padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
  });

  it("agrega padding y traduce -_ a +/", () => {
    const out = urlBase64ToUint8Array("-_8");
    expect(out.length).toBeGreaterThan(0);
    // "-_8" -> "+/8=" -> bytes [251, 255]
    expect(Array.from(out)).toEqual([251, 255]);
  });
});
