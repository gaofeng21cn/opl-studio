async (page) => {
  const assert = (value, label) => { if (!value) throw new Error(label); };
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const nav = () => page.getByRole("navigation", { name: "会话历史分页" }).first();
  const open = async id => {
    await page.getByRole("treeitem").filter({ hasText: `Thread ${id}` }).click();
  };
  const range = async text => { await page.getByText(text, { exact: true }).first().waitFor(); };
  // Expand the sole synthetic workspace if the sidebar starts collapsed.
  if (await page.getByRole("treeitem").filter({ hasText: "Thread thread-source" }).count() === 0) {
    await page.getByRole("treeitem").first().click();
  }
  await open("thread-source");
  await range("61-100 / 100");
  assert(await page.locator("article.message").count() === 40, "mount at most 40 messages");
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    for (const text of await page.locator("article.message").allTextContents()) seen.add(text);
    if (i < 2) await nav().getByRole("button", { name: "更早消息", exact: true }).click();
  }
  await range("1-20 / 100");
  assert(seen.size === 100, "every historical message reachable");
  await nav().getByRole("button", { name: "后续消息", exact: true }).focus();
  await page.keyboard.press("Enter");
  await range("21-60 / 100");
  await page.getByRole("textbox", { name: "向 OPL 描述你的目标" }).fill("history submission probe");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByText("history submission probe", { exact: true }).waitFor();
  await range("63-102 / 102");
  assert(await nav().getByRole("button", { name: "最新消息", exact: true }).isDisabled(), "local submit follows tail");
  // Browse back while the fake turn is still active. Its completion is passive.
  await nav().getByRole("button", { name: "更早消息", exact: true }).click();
  await range("23-62 / 102");
  await page.getByRole("button", { name: "发送", exact: true }).waitFor();
  await range("23-62 / 102");
  await nav().getByRole("button", { name: "最新消息", exact: true }).click();
  await page.getByText("completed turn-created-1", { exact: true }).waitFor();
  assert(await page.locator("article.message").count() === 40, "tail remains bounded");
  await open("thread-idle");
  await page.getByText("History message 40 of 40", { exact: true }).waitFor();
  assert(await page.locator("article.message").count() === 40, "40-message boundary");
  assert(await page.getByRole("navigation", { name: "会话历史分页" }).count() === 0, "no paging for 40");
  await open("thread-unloaded");
  await range("2-41 / 41");
  await nav().getByRole("button", { name: "更早消息", exact: true }).click();
  await range("1-1 / 41");
  assert(await page.locator("article.message").count() === 1, "41-message first page");
  await open("thread-source");
  await range("63-102 / 102");
  await open("thread-subagent");
  await page.waitForFunction(() => document.querySelectorAll("article.message").length === 0);
  assert(await page.locator("article.message").count() === 0, "empty history");
  assert(await page.getByRole("navigation", { name: "会话历史分页" }).count() === 0, "no empty pager");
  assert(errors.length === 0, errors.join("; "));
  return { status: "passed", historyReachable: seen.size, cases: [0, 40, 41, 100], submitFromHistory: true, passiveCompletionPreservesPage: true, keyboard: true, threadSwitch: true };
}
