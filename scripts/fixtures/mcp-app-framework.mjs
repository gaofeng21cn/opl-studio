import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MCP_APP_MIME } from '../../src/host/mcp-app-protocol.mjs';

// The real shared renderer and SDK consume synthetic, read-only owner data.
export async function frameworkFixture(frameworkRoot, outputRoot) {
  const { buildMcpAppView } = await import(pathToFileURL(path.join(frameworkRoot, 'scripts/build-mcp-app-view.mjs')).href);
  await buildMcpAppView(outputRoot);
  const html = await readFile(path.join(outputRoot, 'entrypoints/mcp-app-view.html'), 'utf8');
  const kinds = ['task_board', 'list_detail', 'activity_log', 'approval_diff', 'timeline', 'artifact_view', 'service_status'];
  const titles = ['执行进度', '资料列表', '活动记录', '审阅修改', '任务时间线', '交付产物', '服务状态'];
  const views = kinds.map((kind, i) => ({ package_id: 'preview-owner', package_name: '合成业务数据',
    view_id: kind, view_type: kind, data_ref: `preview#${kind}`, title_i18n: { 'zh-CN': titles[i] }, commands: [], presentation_mode: 'dedicated_app', dedicated_resource_uri: 'ui://preview/dedicated.html' }));
  const owner = kind => ({ state: 'ready', items: [{ id: 'preview-item', storage_ref: 'email-store://demo/inbox/1', title: `合成示例 · ${titles[kinds.indexOf(kind)]}`,
    summary: '用于检验长标题、窄屏导航和业务内容层级的合成数据。', status: 'review_pending',
    stages: [{ title: '读取资料', status: 'completed' }, { title: '等待人工审阅', status: 'running' }],
    next_action: { title: '核对原始资料与审阅结果', summary: '操作始终由原业务负责人执行。' },
    events: [{ occurred_at: '2026-11-11 10:00', title: '读取资料完成', summary: '已生成供人工核对的候选结果。' }],
    preview: { before: '原有内容', after: '待审阅内容及其来源说明' },
    artifacts: [{ title: '示例报告与完整审阅材料', status: 'available', summary: '合成产物，不包含个人资料。' }],
    target: 'long-owner-reference-without-spaces-'.repeat(5),
  }] });
  const result = value => ({ content: [], structuredContent: value });
  const tools = {
    open_opl_apps: { name: 'open_opl_apps', title: 'OPL Apps', inputSchema: {type:'object', properties:{package_id:{type:'string'},view_id:{type:'string'},input:{type:'object'}}}, annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: 'ui://opl/apps.html' } } },
    opl_app_contribution_read: { name: 'opl_app_contribution_read', annotations: { readOnlyHint: true }, _meta: { ui: { visibility: ['app'] } } },
  };
  const targetTool = {name:'open_dedicated',title:'Dedicated review',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{storage_ref:{type:'string'}}},_meta:{ui:{resourceUri:'ui://preview/dedicated.html'}}};
  const targetBundle = await build({stdin:{contents:`import {App} from '@modelcontextprotocol/ext-apps'; const app=new App({name:'Target',version:'1'},{}); app.ontoolresult=result=>{document.getElementById('navigation-target').textContent=JSON.stringify(result.structuredContent)}; await app.connect();`,resolveDir:frameworkRoot},bundle:true,format:'esm',platform:'browser',write:false});
  const targetHtml = `<div id="navigation-target"></div><script type="module">${targetBundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`;
  return { kinds, titles, transport: {
    async request(method, params) {
      assert.equal(params.threadId, 'thread-fixture');
      if (method === 'mcpServerStatus/list') return { data: [{ name: 'opl-apps', tools, resources: [{ uri: 'ui://opl/apps.html' }] }, {name:'dedicated',tools:{open_dedicated:targetTool},resources:[{uri:'ui://preview/dedicated.html'}]}] };
      if (method === 'mcpServer/resource/read') return { contents: [{ uri: params.uri, mimeType: MCP_APP_MIME, text: params.server === 'dedicated' ? targetHtml : html }] };
      if (method === 'mcpServer/tool/call' && params.tool === 'open_opl_apps') return result({ opl_mcp_app_catalog: { views, focus: params.arguments } });
      if (method === 'mcpServer/tool/call' && params.tool === 'opl_app_contribution_read') return result({ result: owner(params.arguments.ref.split('#')[1]) });
      if (method === 'mcpServer/tool/call' && params.tool === 'open_dedicated') return result(params.arguments);
      throw new Error('Unexpected shared renderer request: ' + method);
    },
  } };
}
