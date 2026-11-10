import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CodexAppServerTransport } from '../../src/host/app-server-transport.mjs';
import { createWorkbenchTaskExecutor } from '../../src/host/workbench-task-executor.mjs';
import { createOplPassthrough } from '../../src/host/opl-passthrough.mjs';
import { createWebUiHost } from '../../src/host/http-host.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const framework = process.env.OPL_FRAMEWORK_REPO_ROOT;
const address = process.env.OPL_TEST_TEMPORAL_ADDRESS;
if (!framework || !address || !/^(127\.0\.0\.1|localhost):\d+$/.test(address)) throw Error('Set OPL_FRAMEWORK_REPO_ROOT and a task-owned loopback OPL_TEST_TEMPORAL_ADDRESS.');
const { startCordisWorkbenchServicesHost } = await import(pathToFileURL(path.join(framework, 'dist/host/composition-profiles.js')));
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'opl-dsh-schedule-ui-')));
const cliRoot = path.join(root, 'playwright');
const outputRoot = path.join(repositoryRoot, 'output/playwright/dsh-schedule-ui');
const receiptPath = path.join(repositoryRoot, 'out/acceptance/dsh-schedule-ui.json');
const session = `opl-dsh-schedule-${process.pid}`;
const env = {
  ...process.env, CODEX_HOME: path.join(root, 'codex'), OPL_STATE_DIR: path.join(root, 'state'),
  OPL_FRAMEWORK_PACKAGE_ROOT: framework, OPL_TEMPORAL_ADDRESS: address, OPL_TEMPORAL_NAMESPACE: 'default',
  OPL_STUDIO_READ_ONLY: '0', OPL_NATIVE_WORKBENCH_READ_ONLY: '0', OPL_DATA_DIR: root,
  OPL_STUDIO_LOG_ROOT: path.join(root, 'app-logs'), OPL_STUDIO_CACHE_ROOT: path.join(root, 'app-cache'),
  OPL_WEBUI_DEPLOYMENT_MODE: 'local', OPL_WEBUI_AUTH_MODE: 'none', FAKE_APP_SERVER_LOG: path.join(root, 'codex.jsonl'),
};
const transport = new CodexAppServerTransport({ command: process.execPath,
  args: [path.join(repositoryRoot, 'src/host/fixtures/fake-app-server.mjs')], cwd: root, env, requestTimeoutMs: 3000 });
const evidence = [];
const actions = [];
let service;
let host;
let status = 'failed';
let failure;
let rendererSha256;

function run(executable, args, cwd = cliRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(Error(`${executable} exited ${code}: ${stderr}\n${stdout}`)));
  });
}
async function cli(args) { return run('npx', ['--yes', '--package', '@playwright/cli', 'playwright-cli', '--json', `-s=${session}`, ...args]); }
async function evaluate(expression) {
  const parsed = JSON.parse((await cli(['eval', expression])).stdout.trim());
  return typeof parsed.result === 'string' ? JSON.parse(parsed.result) : parsed.result;
}
async function code(body) { await cli(['run-code', `async page => { ${body} }`]); }
async function snapshot(name) {
  const result = await cli(['snapshot']);
  await writeFile(path.join(outputRoot, `${name}.json`), result.stdout);
}
async function screenshot(name) {
  await cli(['screenshot']);
  const directory = path.join(cliRoot, '.playwright-cli');
  const files = (await readdir(directory)).filter(file => file.endsWith('.png')).sort();
  assert.ok(files.length);
  await copyFile(path.join(directory, files.at(-1)), path.join(outputRoot, `${name}.png`));
}
async function waitUntil(fn, label, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error(`Timed out: ${label}`);
}
const read = (operation, input = {}) => service.read({ package_id: 'opl-workbench-services', ref: `workbench#${operation}`, input });
async function ownerExecute(operation, input) {
  const request = { package_id: 'opl-workbench-services', ref: `workbench#${operation}`, input };
  const preview = await service.execute(request);
  assert.equal(preview.status, 'preview_ready');
  return service.execute({ ...request, dryRun: false, confirmed: true, confirmationId: preview.confirmationId });
}
async function confirm() {
  await code(`await page.getByTestId('opl-settings-action-confirmation').waitFor(); await page.getByTestId('opl-settings-action-confirmation').getByRole('button', { name: /确认执行|Confirm/ }).click(); await page.getByTestId('opl-settings-action-confirmation').waitFor({ state: 'detached' });`);
}
async function reopenTask(title) {
  await code(`const discard = page.locator('[data-testid="task-manager-page"] aside').getByRole('button', { name: '放弃', exact: true }); if (await discard.isEnabled()) await discard.click(); await page.getByRole('button', { name: '关闭详情', exact: true }).click(); await page.getByTestId('task-manager-page').getByRole('button', { name: ${JSON.stringify(title)}, exact: true }).click();`);
}
async function save(kind = 'edit') {
  await code(`await page.locator('[data-testid="task-manager-page"] aside').getByRole('button', { name: ${JSON.stringify(kind === 'create' ? '创建' : '保存修改')}, exact: true }).click();`);
  await confirm();
  await new Promise(resolve => setTimeout(resolve, 350));
}
async function repeat(label) {
  await code(`await page.locator('[data-testid="task-manager-page"] aside').getByRole('button').filter({ hasText: /^重复 / }).click(); await page.getByRole('menuitem', { name: ${JSON.stringify(label)}, exact: true }).click();`);
}
async function setZone(zone) {
  await code(`await page.locator('[data-testid="task-manager-page"] aside').getByRole('button').filter({ hasText: /^时区 / }).click(); await page.getByRole('searchbox', { name: '搜索 UTC 偏移、IANA 标识或城市' }).fill(${JSON.stringify(zone)}); await page.getByRole('menuitem').filter({ hasText: /中欧时间|Central European/ }).first().click();`);
}
async function readTask(title) { return (await read('tasks')).items.find(task => task.title === title); }
async function openSchedule() {
  await code(`await page.locator('nav[aria-label="主页面"]').getByRole('button', { name: '计划任务', exact: true }).click(); await page.getByTestId('task-manager-page').waitFor();`);
}
async function newForm(title, prompt = 'Fixture task; do not access private data.') {
  await code(`await page.getByTestId('task-manager-page').getByRole('button', { name: '新建', exact: true }).click(); await page.getByLabel('自动化任务名称', { exact: true }).fill(${JSON.stringify(title)}); await page.getByLabel('自动化任务内容', { exact: true }).fill(${JSON.stringify(prompt)}); await page.getByLabel('关联工作区', { exact: true }).fill(${JSON.stringify(root)});`);
}

try {
  await Promise.all([mkdir(cliRoot, { recursive: true }), mkdir(outputRoot, { recursive: true }), mkdir(env.CODEX_HOME, { recursive: true }), mkdir(env.OPL_STUDIO_LOG_ROOT), mkdir(env.OPL_STUDIO_CACHE_ROOT)]);
  const rendererBytes = await readFile(path.join(repositoryRoot, 'dist/webui/renderer.js'));
  rendererSha256 = createHash('sha256').update(rendererBytes).digest('hex');
  assert.ok(rendererBytes.toString('utf8').includes('TaskManagerPage'), 'Build the official DSH task page before this acceptance.');
  await transport.start();
  service = await startCordisWorkbenchServicesHost({ env, executor: createWorkbenchTaskExecutor(transport) });
  await waitUntil(async () => (await read('tasks')).status === 'available', 'isolated Temporal owner ready');
  const opl = createOplPassthrough({ env, cwd: root });
  await opl.registerWorkbenchServices(async () => service);
  opl.registerWorkbenchServices = undefined;
  const execute = opl.executeAction.bind(opl);
  opl.executeAction = async request => {
    const receipt = await execute(request);
    actions.push({ operation: request.payload?.ref, dryRun: request.dryRun !== false, confirmed: request.payload?.confirmed === true,
      input: request.payload?.input, status: receipt.status, blockedReason: receipt.blockedReason, preview: receipt.result });
    return receipt;
  };
  opl.readState = async profile => ({ profile, app_state: { app_state: { ...service.appStatePatch(), codex_personalization: {},
    settings_control_center: { app_settings_read_model: { workspace: { selected_path: root } } } } }, readback: { exitCode: 0 } });
  opl.readInitialize = async () => ({ system_initialize: { setup_flow: { is_first_run: false, ready_to_launch: true } }, readback: { exitCode: 0 } });
  opl.readFullDrilldown = async () => ({ detail: 'full', drilldown: {}, readback: { exitCode: 0 } });
  host = await createWebUiHost({ transport, opl, env, dshHome: path.join(root, 'dsh'), workspaceRoot: root,
    webRoot: path.join(repositoryRoot, 'dist/webui') });
  await cli(['open', 'about:blank']);
  await code(`await page.addInitScript(() => { window.__scheduleErrors = []; window.addEventListener('error', event => window.__scheduleErrors.push(event.message)); window.addEventListener('unhandledrejection', event => window.__scheduleErrors.push(String(event.reason))); });`);
  await cli(['goto', host.url]);
  await cli(['resize', '1440', '900']);
  await openSchedule();
  await snapshot('01-official-catalog');
  evidence.push('official DSH TaskManagerPage mounted through product navigation');

  const title = `UI schedule confirmation probe ${process.pid}`;
  await newForm(title);
  await code(`await page.locator('[data-testid="task-manager-page"] aside').getByRole('button', { name: '创建', exact: true }).click(); await page.getByTestId('opl-settings-action-confirmation').waitFor();`);
  const preview = await evaluate(`() => document.querySelector('[data-testid="opl-action-preview-detail"]')?.textContent`);
  assert.ok(preview?.includes(title) && preview?.includes('Framework'), 'real owner preview must identify task and owner');
  assert.equal((await read('tasks')).items.length, 0);
  await snapshot('02-create-preview');
  await screenshot('02-create-preview');
  await code(`await page.getByTestId('opl-settings-action-confirmation').getByRole('button', { name: '取消', exact: true }).click(); await page.getByTestId('opl-settings-action-confirmation').waitFor({ state: 'detached' });`);
  assert.equal(await evaluate(`() => document.querySelector('[data-testid="task-manager-page"] aside input')?.value`), title);
  assert.equal((await read('tasks')).items.length, 0);
  evidence.push('real owner preview; cancelled create preserved official draft and made no task');
  await save('create');
  let task = await waitUntil(() => readTask(title), 'confirmed once task readback');
  await code(`await page.getByTestId('task-manager-page').getByRole('list').getByRole('button').filter({ hasText: ${JSON.stringify(title)} }).click();`);
  assert.equal(task.schedule.kind, 'once'); assert.equal(task.permissions, ':read-only'); assert.equal(task.timeoutMinutes, 30);
  evidence.push('confirmed creation read back a Temporal once task with explicit time zone, permission and timeout');
  await snapshot('03-created-once');

  await repeat('每天');
  await setZone('Europe/Berlin');
  await code(`await page.getByRole('combobox', { name: '执行权限', exact: true }).selectOption(':workspace'); await page.getByRole('spinbutton', { name: '超时（分钟）', exact: true }).fill('45');`);
  await save();
  task = await waitUntil(async () => { const value = await readTask(title); return value?.schedule.kind === 'daily' && value.timeoutMinutes === 45 ? value : undefined; }, 'daily/timezone/permission/timeout owner readback');
  assert.equal(task.schedule.timeZone, 'Europe/Berlin'); assert.equal(task.permissions, ':workspace');
  evidence.push('official repeat and IANA zone menus plus owner permission/timeout edits round-tripped');
  await reopenTask(title);
  await repeat('每周');
  await code(`await page.getByRole('button', { name: '星期一', exact: true }).click(); await page.getByRole('button', { name: '时间', exact: true }).click(); await page.getByRole('listbox', { name: '时' }).getByRole('option').nth(9).click(); await page.getByRole('listbox', { name: '分' }).getByRole('option').nth(10).click();`);
  await save();
  task = await readTask(title); assert.equal(task.schedule.kind, 'weekly'); assert.ok(task.schedule.weekdays.length);
  await reopenTask(title);
  await repeat('每 N 分钟');
  await code(`await page.getByRole('spinbutton', { name: '重复间隔', exact: true }).fill('23');`);
  await save();
  task = await readTask(title); assert.equal(task.schedule.kind, 'interval'); assert.equal(task.schedule.minutes, 23);
  evidence.push('official editor saved daily, weekly and 23-minute interval without private task form');

  await code(`await page.getByRole('button', { name: '暂停任务', exact: true }).click();`); await confirm();
  task = await waitUntil(async () => { const value = await readTask(title); return value?.paused ? value : undefined; }, 'paused owner task');
  await code(`await page.getByRole('button', { name: '恢复任务', exact: true }).click();`); await confirm();
  task = await waitUntil(async () => { const value = await readTask(title); return value?.paused === false ? value : undefined; }, 'resumed owner task');
  evidence.push('pause/resume required App confirmation and changed the same Temporal schedule');

  await code(`await page.getByRole('button', { name: '自动化任务操作', exact: true }).click(); await page.getByRole('menuitem', { name: '立即执行', exact: true }).click();`); await confirm();
  const run = await waitUntil(async () => (await read('history', { id: task.id })).items.find(item => item.result?.status === 'completed'), 'completed canonical Codex run', 25_000);
  const canonical = await transport.readThread(run.result.threadId, true);
  assert.equal(canonical.thread.turns.find(turn => turn.id === run.result.turnId)?.status, 'completed');
  await code(`await page.getByRole('tab', { name: '任务运行记录', exact: true }).click(); await page.getByRole('button', { name: '打开 Codex 结果', exact: true }).waitFor();`);
  await screenshot('04-codex-execution-history');
  await code(`await page.getByRole('button', { name: '打开 Codex 结果', exact: true }).click(); await page.getByTestId('task-manager-page').waitFor({ state: 'detached' });`);
  assert.ok(await evaluate(`() => document.querySelector('main')?.textContent.includes(${JSON.stringify(run.result.turnId)})`));
  evidence.push('run-now acknowledged separately from completed Temporal history; result opened canonical Codex thread/turn');

  await openSchedule();
  await code(`await page.locator('[data-testid="task-manager-page"] button').filter({ hasText: ${JSON.stringify(title)} }).last().click(); await page.locator('[data-testid="task-manager-page"] aside textarea').fill('Unsaved local edit retained after a stale revision');`);
  const beforeConflict = await readTask(title);
  await ownerExecute('task_update', { ...beforeConflict, title: `${title} remote`, revision: beforeConflict.revision });
  const writesBeforeConflict = actions.filter(action => !action.dryRun).length;
  await code(`await page.locator('[data-testid="task-manager-page"] aside').getByRole('button', { name: '保存修改', exact: true }).click();`);
  await waitUntil(async () => actions.some(action => action.status === 'failed' && /changed|operation/i.test(action.blockedReason ?? '')), 'stale owner revision refused');
  const ownerAfterConflict = (await read('tasks')).items.find(value => value.id === beforeConflict.id);
  assert.equal(ownerAfterConflict.title, `${title} remote`);
  assert.equal(ownerAfterConflict.prompt, beforeConflict.prompt);
  assert.equal(actions.filter(action => !action.dryRun).length, writesBeforeConflict);
  assert.equal(await evaluate(`() => document.querySelector('[data-testid="task-manager-page"] aside textarea')?.value`), 'Unsaved local edit retained after a stale revision');
  evidence.push('separate owner update caused CAS rejection before execute; stale draft was preserved');
  await snapshot('05-conflict-preserved-draft');

  await code(`await page.locator('[data-testid="task-manager-page"] aside').getByRole('button', { name: '放弃', exact: true }).click();`);
  await code(`await page.locator('[data-testid="task-manager-page"] button').filter({ hasText: ${JSON.stringify(`${title} remote`)} }).last().click();`);
  await code(`await page.locator('[data-testid="task-manager-page"] aside').getByRole('tab', { name: '规则', exact: true }).click();`);
  await code(`await page.getByRole('button', { name: '自动化任务操作', exact: true }).click(); await page.getByRole('menuitem', { name: '删除任务', exact: true }).click(); await page.getByRole('button', { name: '确认删除', exact: true }).click();`);
  await confirm();
  await waitUntil(async () => !(await read('tasks')).items.some(value => value.id === task.id), 'task deletion owner readback');
  assert.ok((await read('history', { id: task.id })).items.some(value => value.result?.turnId === run.result.turnId));
  await code(`await page.getByText('Codex 执行历史（含已删除任务）', { exact: true }).click(); await page.getByRole('button', { name: '打开 Codex 结果', exact: true }).waitFor();`);
  await screenshot('06-deleted-task-history-retained');
  evidence.push('confirmed deletion removed only schedule; global official-page footer retained deleted task execution and result link');

  const log = (await readFile(env.FAKE_APP_SERVER_LOG, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(log.some(row => row.method === 'turn/start' && row.params.sandboxPolicy.type === 'workspaceWrite'));
  assert.ok(!log.some(row => row.method === 'turn/start' && row.params.sandboxPolicy.type === 'dangerFullAccess'));
  const errors = await evaluate(`() => window.__scheduleErrors`);
  assert.deepEqual(errors, []);
  evidence.push('browser runtime had no uncaught errors; canonical executor used workspaceWrite and never dangerFullAccess');
  status = 'passed';
} catch (error) {
  failure = String(error?.stack ?? error);
  await snapshot('failure').catch(() => undefined);
  await screenshot('failure').catch(() => undefined);
  throw error;
} finally {
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify({ status, evidence, failure, actions, testedAt: new Date().toISOString(),
    rendererSha256, runtime: 'isolated task-owned Temporal + real Framework owner + fake canonical Codex App Server + real browser',
    source_commit: (await run('git', ['rev-parse', 'HEAD'], repositoryRoot)).stdout.trim(),
    installedEvidence: false, releaseReady: false, artifacts: path.relative(repositoryRoot, outputRoot) }, null, 2)}\n`);
  await cli(['close']).catch(() => undefined);
  await host?.close(); await service?.dispose(); await transport.stop();
  await rm(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ status, evidence, receipt: path.relative(repositoryRoot, receiptPath) }, null, 2));
