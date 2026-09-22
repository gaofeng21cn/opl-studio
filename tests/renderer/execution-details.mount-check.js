async (page) => {
  const assert = (value, label) => { if (!value) throw new Error(label); };
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const open = async id => {
    await page.getByRole("treeitem").filter({ hasText: `Thread ${id}` }).click();
    await page.locator("strong").filter({ hasText: new RegExp(`^Thread ${id}$`) }).waitFor();
  };
  const nav = () => page.getByRole("navigation", { name: "会话历史分页" }).first();
  const all = label => page.getByRole("button", { name: label, exact: true });
  await page.reload();
  await page.getByRole("treeitem").first().waitFor();
  if (await page.getByRole("treeitem").filter({ hasText: "Thread thread-source" }).count() === 0) {
    await page.getByRole("treeitem").first().click();
  }
  await open("thread-source");
  await page.getByText("61-100 / 100", { exact: true }).first().waitFor();
  assert(await page.locator("article.message").count() === 40, "bounded history");
  assert(await page.locator(".execution-message .message-frame").count() === 0, "collapsed bodies are unmounted");
  await page.getByRole("heading", { name: "Answer 25", exact: true }).waitFor();
  assert(await page.getByText("执行未成功", { exact: true }).count() === 1, "failure summary remains visible");
  assert(await page.getByText(/TRACE DETAIL/).count() === 0, "stack details collapsed");
  const failure = () => page.locator("article.message").filter({ hasText: "Input unavailable" });
  await failure().getByRole("button").focus();
  await page.keyboard.press("Enter");
  await page.getByText(/TRACE DETAIL/).waitFor();
  await nav().getByRole("button", { name: "更早消息", exact: true }).click();
  await nav().getByRole("button", { name: "最新消息", exact: true }).click();
  assert(await failure().getByRole("button").getAttribute("aria-expanded") === "true", "paging retains choice");
  await open("thread-idle");
  assert(await page.locator(".execution-message .message-frame").count() === 0, "same item identity in another thread stays independent");
  await open("thread-source");
  assert(await failure().getByRole("button").getAttribute("aria-expanded") === "true", "thread return retains choice");
  await all("展开全部详情").click();
  assert(await page.locator(".execution-message .message-frame").count() === 20, "all details expand");
  await nav().getByRole("button", { name: "更早消息", exact: true }).click();
  assert(await page.locator(".execution-message .message-frame").count() === 20, "expand all includes earlier loaded pages");
  await all("收起全部详情").click();
  assert(await page.locator(".execution-message .message-frame").count() === 0, "all details collapse");
  await open("thread-running");
  await page.locator(".conversation-progress").getByText("Current progress outside details").waitFor();
  assert(await page.locator(".execution-message .message-frame").count() === 0, "running details default collapsed");
  await open("thread-source");
  await page.getByRole("textbox", { name: "向 OPL 描述你的目标" }).fill("Execution disclosure streaming probe");
  await all("发送").click();
  await page.locator(".conversation-progress").getByText("Streaming progress remains visible", { exact: true }).waitFor();
  await all("允许").waitFor();
  await page.getByRole("textbox", { name: /Fixture input/ }).waitFor();
  const streaming = () => page.locator("article.message.execution-message").last().getByRole("button");
  await streaming().click();
  await page.locator(".conversation-progress").getByText("Streaming progress remains visible after update", { exact: true }).waitFor();
  assert(await streaming().getAttribute("aria-expanded") === "true", "delta preserves expansion");
  await all("收起全部详情").click();
  assert(await all("允许").isVisible(), "approval outside disclosures");
  assert(await page.getByRole("textbox", { name: /Fixture input/ }).isVisible(), "required input outside disclosures");
  await page.getByRole("textbox", { name: /Fixture input/ }).fill("synthetic response");
  await all("提交").click();
  await streaming().click();
  await all("允许").click();
  await page.getByText("completed turn-created-1", { exact: true }).waitFor();
  assert(await page.locator("article.message").filter({ hasText: "Streaming progress remains visible after update" }).getByRole("button").getAttribute("aria-expanded") === "true", "canonical readback preserves live item expansion");
  assert(await page.locator(".conversation-progress").count() === 0, "completion clears progress");
  assert(await page.locator("article.message").count() === 40, "streaming completion preserves page bound");
  assert(errors.length === 0, errors.join("; "));
  return { status: "passed", defaults: true, fullEvidence: true, failureVisible: true, pagination: true,
    threadIsolation: true, keyboard: true, expandCollapseAll: true, streaming: true, approvalsAndInput: true, finalAnswer: true };
}
