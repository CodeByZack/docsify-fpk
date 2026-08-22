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
 *
 * 交互：画布内拖动平移、滚轮缩放（markmap 原生）；右上角 ⛶ 进入全屏，
 * 再点或 Esc 退出。颜色跟随 docsify 亮/暗主题（--color-text/--color-bg）。
 */
(function () {
  'use strict';

  var LIB = window.markmapDocsify;
  if (!LIB || !LIB.Transformer || !LIB.Markmap) {
    console.warn('[docsify-markmap] 未检测到 markmap.bundle.min.js，脑图渲染已禁用');
    return;
  }

  // 注入基础样式（幂等）。文字/圆点/代码底色映射到 docsify 主题变量：
  // bundle 自带的 prefers-color-scheme 适配只认系统、不认站内手动切换，
  // 这里显式覆盖，保证 🌓 手动切到暗色时文字仍可见。
  if (!document.getElementById('docsify-markmap-style')) {
    var style = document.createElement('style');
    style.id = 'docsify-markmap-style';
    style.textContent = [
      '.markmap{position:relative;border:1px solid var(--border-color,#eee);',
      'border-radius:6px;margin:1em 0;overflow:hidden;background:var(--markmap-bg,transparent)}',
      /* 提高特异性：bundle 会在 svg 内再注入一份 .markmap 变量声明（同特异性时后来者胜），
         这里用 .markdown-section 前缀压过它，保证跟随站内手动亮暗切换 */
      '.markdown-section .markmap{',
      '--markmap-text-color:var(--color-text,#333);',
      '--markmap-circle-open-bg:var(--color-bg,#fff);',
      '--markmap-code-bg:rgba(127,127,127,.16);',
      '--markmap-code-color:var(--color-text,#333)}',
      '.markmap>svg{display:block;width:100%;height:var(--mm-h,320px)}',
      '.markmap .markmap-error{padding:12px;color:#c0392b;font-size:14px}',
      /* 全屏按钮 */
      '.markmap .mm-fs-btn{position:absolute;top:8px;right:8px;z-index:20;width:32px;height:32px;',
      'border-radius:6px;border:1px solid rgba(127,127,127,.4);background:var(--color-bg,#fff);',
      'color:var(--color-text,#333);font-size:16px;line-height:1;cursor:pointer;opacity:.3;',
      'transition:opacity .15s}',
      '.markmap:hover .mm-fs-btn,.markmap:fullscreen .mm-fs-btn,.markmap.markmap-expanded .mm-fs-btn{opacity:.92}',
      /* 全屏态：优先原生 Fullscreen API，不支持时退化为 fixed 覆盖层 */
      '.markmap:fullscreen{padding:4px;background:var(--color-bg,#fff)}',
      '.markmap:fullscreen>svg{height:calc(100vh - 8px)}',
      '.markmap.markmap-expanded{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483000;',
      'margin:0;padding:4px;border-radius:0;background:var(--color-bg,#fff)}',
      '.markmap.markmap-expanded>svg{height:calc(100vh - 8px)}'
    ].join('');
    document.head.appendChild(style);
  }

  var transformer = new LIB.Transformer();

  function parseBlock(scriptEl) {
    // 取原始 markdown 文本；script 内容浏览器不会渲染，天然避免被 docsify 二次处理
    return scriptEl.textContent.replace(/^\s*\n/, '');
  }

  /* ---------- 全屏 ---------- */

  function isExpanded(wrapper) {
    return document.fullscreenElement === wrapper ||
      wrapper.classList.contains('markmap-expanded');
  }

  function exitExpanded(wrapper) {
    if (document.fullscreenElement === wrapper && document.exitFullscreen) {
      document.exitFullscreen();
    } else {
      wrapper.classList.remove('markmap-expanded');
      refitSoon(wrapper);
    }
  }

  function enterExpanded(wrapper) {
    if (wrapper.requestFullscreen) {
      try {
        var p = wrapper.requestFullscreen();
        if (p && p.catch) {
          p.catch(function () { wrapper.classList.add('markmap-expanded'); refitSoon(wrapper); });
        }
      } catch (e) {
        wrapper.classList.add('markmap-expanded');
        refitSoon(wrapper);
      }
    } else {
      wrapper.classList.add('markmap-expanded');
      refitSoon(wrapper);
    }
  }

  function toggleFS(wrapper) {
    if (isExpanded(wrapper)) exitExpanded(wrapper);
    else enterExpanded(wrapper);
  }

  // 尺寸变化后让导图重新适配画布（CSS 过渡结束后再 fit 才能拿到最终尺寸）
  function refitSoon(wrapper) {
    setTimeout(function () {
      if (wrapper.__markmap) {
        try { wrapper.__markmap.fit(); } catch (e) { /* ignore */ }
      }
    }, 350);
  }

  document.addEventListener('fullscreenchange', function () {
    document.querySelectorAll('.markdown-section div.markmap').forEach(refitSoon);
  });

  function ensureFsButton(wrapper) {
    if (wrapper.querySelector('.mm-fs-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mm-fs-btn';
    btn.title = '全屏查看（画布内可拖动平移 / 滚轮缩放，Esc 退出）';
    btn.setAttribute('aria-label', '脑图全屏');
    btn.textContent = '⛶';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFS(wrapper);
      // 更新按钮语义（展开态再点即关闭）
      btn.title = isExpanded(wrapper)
        ? '退出全屏'
        : '全屏查看（画布内可拖动平移 / 滚轮缩放，Esc 退出）';
    });
    wrapper.appendChild(btn);
  }

  /* ---------- 渲染 ---------- */

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

      // 关键变量内联兜底：bundle 注入的样式无论怎么排序都赢不过内联
      wrapper.style.setProperty('--markmap-text-color', 'var(--color-text, #333)');
      wrapper.style.setProperty('--markmap-circle-open-bg', 'var(--color-bg, #fff)');
      wrapper.style.setProperty('--markmap-code-bg', 'rgba(127,127,127,.16)');
      wrapper.style.setProperty('--markmap-code-color', 'var(--color-text, #333)');

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
      ensureFsButton(wrapper);
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
