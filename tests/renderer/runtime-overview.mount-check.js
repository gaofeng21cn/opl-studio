async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const summary = () => page.locator('.runtime-list-summary').innerText();
  await page.reload();
  await page.getByRole('heading', { name: '项目运行总览', exact: true }).waitFor();
  await page.getByRole('button', { name: '打开维护', exact: true }).click();
  assert(await page.evaluate(() => window.runtimeEvidence.maintenance) === 1, 'maintenance route callback');
  await page.getByRole('button', { name: '刷新运行状态', exact: true }).click();
  assert(await page.evaluate(() => window.runtimeEvidence.refresh) === 1, 'fresh read callback');
  await page.keyboard.press('Tab');
  assert(await page.getByRole('button', { name: '打开维护', exact: true }).evaluate(el => document.activeElement === el), 'maintenance keyboard access');
  await page.getByRole('combobox', { name: '智能体', exact: true }).selectOption('writing');
  assert((await summary()).includes('1 项工作 · 运行中 0 · 需关注 1'), 'agent scope counts');
  await page.getByRole('combobox', { name: '项目', exact: true }).selectOption('report');
  await page.getByRole('combobox', { name: '智能体', exact: true }).selectOption('research');
  assert(await page.getByRole('combobox', { name: '项目', exact: true }).inputValue() === 'all', 'project resets on agent change');
  assert((await summary()).includes('1 项工作 · 运行中 1 · 需关注 0'), 'no infrastructure in attention count');
  assert(await page.getByRole('button', { name: '归档库 (0)', exact: true }).count() === 1, 'archive count respects agent scope');
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('attention');
  await page.getByText('没有符合此状态的工作', { exact: true }).waitFor();
  await page.getByRole('button', { name: '清除状态筛选', exact: true }).click();
  assert(await page.locator('.runtime-work-row').count() === 1, 'clear filter restores scoped list');
  await page.getByRole('combobox', { name: '智能体', exact: true }).selectOption('all');
  await page.getByRole('button', { name: '归档库 (1)', exact: true }).click();
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('completed');
  assert(await page.locator('.runtime-work-row').count() === 1, 'delivered auto-paused item remains under delivered');
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('all');
  await page.getByRole('button', { name: '返回当前任务', exact: true }).click();

  const layouts = [];
  for (const locale of ['zh', 'en']) {
    await page.evaluate(value => window.setRuntimeLocale(value), locale);
    await page.getByRole('heading', { name: locale === 'zh' ? '项目运行总览' : 'Project runtime overview', exact: true }).waitFor();
    for (const dark of [false, true]) {
      await page.evaluate(value => document.body.toggleAttribute('data-ds-dark-theme', value), dark);
      for (const width of [375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const layout = await page.evaluate(() => {
          const root = document.querySelector('.opl-runtime-overview');
          const row = document.querySelector('.runtime-work-row');
          return { viewport: innerWidth, document: document.documentElement.scrollWidth,
            content: root.clientWidth, scroll: root.scrollWidth,
            columns: getComputedStyle(row).gridTemplateColumns.split(' ').length };
        });
        assert(layout.document <= width && layout.scroll <= layout.content + 1, `overflow ${locale}/${dark}/${width}`);
        assert(layout.columns === (width === 1440 ? 4 : width === 375 ? 1 : 2), `semantic columns ${JSON.stringify(layout)}`);
        layouts.push({ locale, dark, ...layout });
        await page.screenshot({ path: `output/playwright/runtime-status/runtime-${locale}-${dark ? 'dark' : 'light'}-${width}.png`, fullPage: true });
      }
    }
  }
  await page.evaluate(() => { window.setRuntimeLocale('zh'); document.body.removeAttribute('data-ds-dark-theme'); });
  await page.getByRole('heading', { name: '项目运行总览', exact: true }).waitFor();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByRole('button', { name: '当前阶段: 数据分析', exact: true }).first().click();
  await page.getByRole('button', { name: '关闭阶段进度', exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/runtime-status/stage-popover.png', fullPage: true });
  await page.getByRole('button', { name: '关闭阶段进度', exact: true }).click();
  for (const [scenario, text] of [
    ['unknown', '后台服务状态尚未读取'], ['cached', '上次服务检查'],
    ['loading', '正在读取任务…'], ['failed', '运行状态暂不可用'], ['empty', '当前范围没有工作']
  ]) {
    await page.evaluate(value => window.setRuntimeScenario(value), scenario);
    await page.getByText(text, { exact: false }).first().waitFor();
    if (['unknown', 'cached'].includes(scenario)) assert(await page.locator('.runtime-service-notice').getAttribute('data-tone') === 'unknown', 'unconfirmed state stays neutral');
    if (['loading', 'failed'].includes(scenario)) assert(await page.locator('.runtime-service-notice').count() === 0, 'no contradictory service notice without task readback');
    if (scenario === 'failed') await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.screenshot({ path: `output/playwright/runtime-status/state-${scenario}.png`, fullPage: true });
  }
  await page.evaluate(() => window.setRuntimeScenario('drift'));
  await page.getByRole('heading', { name: '后台服务配置已变化，需要重新加载', exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
  return { status: 'passed', layouts, interactions: await page.evaluate(() => window.runtimeEvidence) };
}
