import { describe, expect, it } from "vitest";
import { isAdminRole, roleOf, tokenPayload, userIdOf } from "./auth";
import { apiError, formatAddress, formatAttrs, imageUrl, money, parseAttrs, type Address } from "./shared";

// Unsigned JWT-shaped token with a base64url payload (signature is irrelevant for UI hints).
const token = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.s`;

describe("auth helpers", () => {
  it("reads role and user id from the token payload", () => {
    const t = token({ userId: "u-1", role: "SUPERADMIN" });
    expect(roleOf(t)).toBe("SUPERADMIN");
    expect(userIdOf(t)).toBe("u-1");
  });

  it("never throws on empty or malformed tokens", () => {
    expect(tokenPayload("")).toEqual({});
    expect(roleOf("garbage")).toBe("");
    expect(userIdOf("a.%%%.b")).toBe("");
  });

  it("only ADMIN and SUPERADMIN are admins", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("SUPERADMIN")).toBe(true);
    expect(isAdminRole("CUSTOMER")).toBe(false);
    expect(isAdminRole("")).toBe(false);
  });
});

describe("shared formatters", () => {
  const address: Address = {
    id: "a1",
    label: "Home",
    street: "Av. Paulista",
    number: "1000",
    complement: null,
    district: null,
    city: "São Paulo",
    state: "SP",
    zip_code: "01310-100",
    country: "BR",
  };

  it("formats an address with and without complement", () => {
    expect(formatAddress(address)).toBe("Av. Paulista, 1000 · São Paulo/SP · 01310-100");
    expect(formatAddress({ ...address, complement: "Apt 12" })).toBe("Av. Paulista, 1000 - Apt 12 · São Paulo/SP · 01310-100");
  });

  it("formats money with 2 decimals from numbers or Decimal strings", () => {
    expect(money(10)).toBe("$ 10.00");
    expect(money("199.9")).toBe("$ 199.90");
  });

  it("parses and formats variant attributes, ignoring incomplete pairs", () => {
    expect(parseAttrs(" color = black, size=M, broken, =x ")).toEqual({ color: "black", size: "M" });
    expect(formatAttrs({ color: "black", size: "M" })).toBe("color=black, size=M");
    expect(formatAttrs(null)).toBe("");
  });

  it("extracts the API error message, falling back sensibly", () => {
    expect(apiError({ response: { data: { error: "Out of stock" } } })).toBe("Out of stock");
    expect(apiError(new Error("Network Error"))).toBe("Network Error");
    expect(apiError(undefined)).toBe("Something went wrong");
  });

  it("encodes image paths in the uploads URL", () => {
    expect(imageUrl("a b/../c.webp")).toMatch(/\/uploads\?path=a%20b%2F..%2Fc\.webp$/);
  });
});
