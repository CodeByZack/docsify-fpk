/*!
 * docsify-markmap.js — docsify-fpk 本地化 markmap 集成（无 CDN 依赖）
 *
 * 依赖：assets/markmap.bundle.min.js（需在本文件之前加载），
 *       其中暴露 window.markmapDocsify = { Transformer, Markmap, deriveOptions }。
 *
 * 用法一（推荐）：裸 <script> 块，markdown-it 按类型 1 原样输出，内容可含空行：
 *
 * <script type="text/template" data-height="420">
 * # 根节点
 * ## 分支一
 * - 叶子
 * </script>
 *
 * 用法二：外层 <div class="markmap"> 包裹（注意 markdown-it 的 html block 遇到
 * 空行会截断，此写法模板内不能有空行）。
 *
 * 可选：data-height="480" 控制画布高度（px）；script 内首部可加 YAML frontmatter：
 * ---
 * markmap:
 *   initialExpandLevel: -1
 *   colorFreezeLevel: 2
 * ---
 */
(function () {
  'use strict';

  var LIB = window.markmapDocsify;
  if (!LIB || !LIB.Transformer || !LIB.Markmap) {
    console.warn('[docsify-markmap] 未检测到 markmap.bundle.min.js，脑图渲染已禁用');
    return;
  }

  // 注入基础样式（幂等）
  if (!document.getElementById('docsify-markmap-style')) {
    var style = document.createElement('style');
    style.id = 'docsify-markmap-style';
    style.textContent = [
      '.markmap{position:relative;border:1px solid var(--border-color,#eee);',
      'border-radius:6px;margin:1em 0;overflow:hidden;background:var(--markmap-bg,transparent)}',
      '.markmap>svg{display:block;width:100%;height:var(--mm-h,320px)}',
      '.markmap .markmap-error{padding:12px;color:#c0392b;font-size:14px}'
    ].join('');
    document.head.appendChild(style);
  }

  var transformer = new LIB.Transformer();

  function parseBlock(scriptEl) {
    // 取原始 markdown 文本；script 内容浏览器不会渲染，天然避免被 docsify 二次处理
    return scriptEl.textContent.replace(/^\s*\n/, '');
  }

  function renderOne(script, wrapper) {
    // wrapper：script 的展示容器。div.markmap>script 时为该 div；裸 script 时自动补壳
    if (wrapper && wrapper.__markmapDone) return;
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'markmap';
      script.parentNode.insertBefore(wrapper, script);
      wrapper.appendChild(script);
    }

    var md = parseBlock(script);
    var options = {};
    var heightSrc = wrapper.dataset.height || script.dataset.height;

    try {
      var result = transformer.transform(md);

      // 支持 frontmatter 中的 markmap 配置
      if (result.frontmatter && result.frontmatter.markmap && LIB.deriveOptions) {
        options = LIB.deriveOptions(result.frontmatter.markmap) || {};
      }

      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      wrapper.textContent = '';
      wrapper.appendChild(svg);

      if (heightSrc) {
        div_height(wrapper, heightSrc);
      }

      // 复用实例（同页二次进入时只更新数据），否则新建
      if (wrapper.__markmap) {
        wrapper.__markmap.setData(result.root);
        wrapper.__markmap.fit();
      } else {
        wrapper.__markmap = LIB.Markmap.create(svg, options, result.root);
      }
      wrapper.__markmapDone = true;
    } catch (e) {
      console.error('[docsify-markmap] 渲染失败:', e);
      wrapper.textContent = '';
      var tip = document.createElement('pre');
      tip.className = 'markmap-error';
      tip.textContent = '脑图渲染失败: ' + (e && e.message ? e.message : e);
      wrapper.appendChild(tip);
      wrapper.__markmapDone = true;
    }
  }

  function div_height(el, px) {
    el.style.setProperty('--mm-h', parseInt(px, 10) + 'px');
  }

  function renderAll() {
    var section = document.querySelector('.markdown-section');
    if (!section) return;
    // 用法一：div.markmap > script
    var wrapped = section.querySelectorAll('div.markmap > script[type="text/template"]');
    for (var i = 0; i < wrapped.length; i++) renderOne(wrapped[i], wrapped[i].parentNode);
    // 用法二：裸 script（markdown-it 原样输出，空行安全），补壳后渲染
    var bare = section.querySelectorAll('script[type="text/template"]');
    for (var j = 0; j < bare.length; j++) {
      if (bare[j].parentNode && bare[j].parentNode.classList &&
          bare[j].parentNode.classList.contains('markmap')) continue;
      renderOne(bare[j], null);
    }
  }

  window.$docsify = window.$docsify || {};
  var plugins = (window.$docsify.plugins = window.$docsify.plugins || []);
  plugins.push(function (hook) {
    hook.mounted(renderAll);
    hook.doneEach(renderAll);
  });
})();
