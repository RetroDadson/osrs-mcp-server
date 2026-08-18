import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { pubsub } from "../src/data/pubsub";

describe("api", () => {
  beforeEach(() => {
    api.groupName = undefined;
    api.groupToken = undefined;

    globalThis.fetch = vi.fn();
  });

  it("sets credentials and exposes group-scoped urls", () => {
    api.setCredentials("iron-team", "secret-token");

    expect(api.groupName).toBe("iron-team");
    expect(api.groupToken).toBe("secret-token");
    expect(api.getGroupDataUrl).toContain("/group/iron-team/get-group-data");
    expect(api.addMemberUrl).toContain("/group/iron-team/add-group-member");
    expect(api.deleteMemberUrl).toContain("/group/iron-team/delete-group-member");
    expect(api.renameMemberUrl).toContain("/group/iron-team/rename-group-member");
    expect(api.amILoggedInUrl).toContain("/group/iron-team/am-i-logged-in");
  });

  it("disable clears credentials", () => {
    api.groupName = "gim";
    api.groupToken = "token";

    api.disable();

    expect(api.groupName).toBeUndefined();
    expect(api.groupToken).toBeUndefined();
  });

  it("refreshMembers publishes member names after a successful fetch", async () => {
    api.setCredentials("gim", "token");

    const payload = [
      { name: "Alice", stats: [1, 2, 3] },
      { name: "Bob", inventory: [] },
    ];
    globalThis.fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(payload) });
    const publishSpy = vi.spyOn(pubsub, "publish");

    await api.refreshMembers();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/group/gim/get-group-data?from_time=${new Date(0).toISOString()}`,
      { headers: { Authorization: "token" } },
    );
    expect(publishSpy).toHaveBeenCalledWith("members-updated", [{ name: "Alice" }, { name: "Bob" }]);
  });

  it("refreshMembers handles unauthorized responses by disabling and redirecting", async () => {
    api.setCredentials("gim", "token");
    const disableSpy = vi.spyOn(api, "disable");
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const publishSpy = vi.spyOn(pubsub, "publish");

    globalThis.fetch.mockResolvedValue({ ok: false, status: 401 });

    await api.refreshMembers();

    expect(disableSpy).toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledWith("", "", "/login");
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("refreshMembers ignores non-401 fetch errors", async () => {
    const disableSpy = vi.spyOn(api, "disable");
    const publishSpy = vi.spyOn(pubsub, "publish");

    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    await api.refreshMembers();

    expect(disableSpy).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("sends expected request shapes for member and auth helper endpoints", async () => {
    api.setCredentials("gim", "token");

    const response = { ok: true, json: vi.fn().mockResolvedValue({ enabled: true }) };
    globalThis.fetch.mockResolvedValue(response);

    await api.createGroup("new-group", ["Alice", "Bob"], "captcha-token");
    await api.addMember("Charlie");
    await api.removeMember("Charlie");
    await api.renameMember("Charlie", "Charlotte");
    await api.amILoggedIn();
    await api.getCaptchaEnabled();

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/create-group",
      {
        body: JSON.stringify({
          name: "new-group",
          member_names: ["Alice", "Bob"],
          captcha_response: "captcha-token",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/group/gim/add-group-member",
      {
        body: JSON.stringify({ name: "Charlie" }),
        headers: { "Content-Type": "application/json", Authorization: "token" },
        method: "POST",
      },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      "/api/group/gim/delete-group-member",
      {
        body: JSON.stringify({ name: "Charlie" }),
        headers: { "Content-Type": "application/json", Authorization: "token" },
        method: "DELETE",
      },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      4,
      "/api/group/gim/rename-group-member",
      {
        body: JSON.stringify({ original_name: "Charlie", new_name: "Charlotte" }),
        headers: { "Content-Type": "application/json", Authorization: "token" },
        method: "PUT",
      },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(5, "/api/group/gim/am-i-logged-in", {
      headers: { Authorization: "token" },
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(6, "/api/captcha-enabled");
  });
});
