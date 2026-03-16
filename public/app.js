// BookLens — AI-powered book summarizer
// Compiled by Babel standalone in the browser (no build step needed)

const { useState, useEffect, useRef, useCallback } = React;

// ── i18n ──────────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    appName: 'BookLens',
    tagline: 'AI-Powered Book Summarizer',
    tabSearch: 'Title / ISBN',
    tabUpload: 'Upload PDF',
    searchPlaceholder: 'Enter book title or ISBN…',
    searchBtn: 'Summarize',
    dropzone: 'Drop your PDF here',
    dropzoneSub: 'or click to browse',
    uploadBtn: 'Summarize PDF',
    loadingFetch: 'Fetching book info…',
    loadingChapters: 'Detecting chapters…',
    loadingSummary: 'Generating chapter summaries…',
    loadingMindmap: 'Building mind map…',
    chapterSummary: 'Chapter Summary',
    keyTakeaways: 'Key Takeaways',
    keyConcepts: 'Key Concepts',
    mindMapTitle: 'Mind Map',
    exportBtn: 'Download Summary as PDF',
    exportingBtn: 'Generating PDF…',
    downloadServerPdf: 'Download Saved PDF',
    author: 'Author',
    unknownAuthor: 'Unknown Author',
    errorTitle: 'Something went wrong',
    noResults: 'No results found.',
    pdfSelected: 'Selected:',
    collapseAll: 'Collapse All',
    expandAll: 'Expand All',
    languageLabel: 'Language',
    outputLanguage: 'Output Language',
    outputLangEn: 'English',
    outputLangZh: '中文',
    outputLangHint: 'Summaries will be generated in the selected language.',
    clickNodeHint: 'Click nodes to expand / collapse',
  },
  zh: {
    appName: 'BookLens',
    tagline: 'AI 图书摘要工具',
    tabSearch: '书名 / ISBN',
    tabUpload: '上传 PDF',
    searchPlaceholder: '输入书名或 ISBN…',
    searchBtn: '生成摘要',
    dropzone: '将 PDF 拖放至此处',
    dropzoneSub: '或点击浏览',
    uploadBtn: '上传并摘要',
    loadingFetch: '正在获取图书信息…',
    loadingChapters: '正在识别章节…',
    loadingSummary: '正在生成章节摘要…',
    loadingMindmap: '正在构建思维导图…',
    chapterSummary: '章节摘要',
    keyTakeaways: '核心要点',
    keyConcepts: '核心概念',
    mindMapTitle: '思维导图',
    exportBtn: '下载 PDF 摘要',
    exportingBtn: '正在生成 PDF…',
    downloadServerPdf: '下载已保存的 PDF',
    author: '作者',
    unknownAuthor: '未知作者',
    errorTitle: '出现错误',
    noResults: '未找到结果。',
    pdfSelected: '已选择：',
    collapseAll: '全部折叠',
    expandAll: '全部展开',
    languageLabel: '语言',
    outputLanguage: '输出语言',
    outputLangEn: 'English',
    outputLangZh: '中文',
    outputLangHint: '摘要将以所选语言生成。',
    clickNodeHint: '点击节点可展开/折叠',
  },
};

function useTranslation(lang) {
  return (key) => TRANSLATIONS[lang][key] || key;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return <div className="spinner mx-auto" />;
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header({ t }) {
  return (
    <header className="header-gradient text-white shadow-lg sticky top-0 z-50 safe-top">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center">
        <div className="flex items-center gap-3">
          <img src="/bookLens.svg" alt="BookLens logo" className="w-9 h-9 rounded-lg" />
          <div>
            <h1 className="font-serif text-2xl font-bold leading-tight">{t('appName')}</h1>
            <p className="text-amber-200 text-xs leading-tight">{t('tagline')}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

// ── Tab Selector ──────────────────────────────────────────────────────────────
function TabSelector({ activeTab, onTabChange, t }) {
  return (
    <div className="flex gap-2 mb-5 bg-amber-100 p-1 rounded-lg w-fit">
      <button
        className={`tab-btn${activeTab === 'search' ? ' active' : ''}`}
        onClick={() => onTabChange('search')}
      >
        {t('tabSearch')}
      </button>
      <button
        className={`tab-btn${activeTab === 'upload' ? ' active' : ''}`}
        onClick={() => onTabChange('upload')}
      >
        {t('tabUpload')}
      </button>
    </div>
  );
}

// ── Output Language Selector ──────────────────────────────────────────────────
function OutputLanguageSelector({ language, onToggle, t }) {
  return (
    <div className="mb-5 p-4 bg-amber-50 border border-amber-100 rounded-xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-stone-700">{t('outputLanguage')}</p>
          <p className="text-xs text-stone-400 mt-0.5">{t('outputLangHint')}</p>
        </div>
        <div className="flex gap-1 bg-white border border-amber-200 p-1 rounded-xl shadow-sm">
          <button
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all${
              language === 'en'
                ? ' bg-amber-500 text-white shadow-sm'
                : ' text-stone-500 hover:text-stone-700 hover:bg-amber-50'
            }`}
            onClick={() => onToggle('en')}
          >
            {t('outputLangEn')}
          </button>
          <button
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all${
              language === 'zh'
                ? ' bg-amber-500 text-white shadow-sm'
                : ' text-stone-500 hover:text-stone-700 hover:bg-amber-50'
            }`}
            onClick={() => onToggle('zh')}
          >
            {t('outputLangZh')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Search Input ──────────────────────────────────────────────────────────────
function SearchInput({ query, onQueryChange, onSubmit, loading, t }) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="flex gap-3"
    >
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="flex-1 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
        disabled={loading}
      />
      <button
        type="submit"
        className="btn-primary"
        disabled={loading || !query.trim()}
      >
        {t('searchBtn')}
      </button>
    </form>
  );
}

// ── PDF Uploader ──────────────────────────────────────────────────────────────
function PDFUploader({ onSubmit, loading, t }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') setFile(dropped);
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
  };

  const handleSubmit = () => {
    if (file) onSubmit(file);
  };

  return (
    <div className="space-y-4">
      <div
        className={`upload-zone flex flex-col items-center justify-center gap-3 py-12 px-6 cursor-pointer${dragOver ? ' drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current && inputRef.current.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current && inputRef.current.click()}
        aria-label="Upload PDF"
      >
        {/* Book icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-14 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
        <div className="text-center">
          <p className="font-semibold text-amber-800 text-lg">{t('dropzone')}</p>
          <p className="text-stone-500 text-sm">{t('dropzoneSub')}</p>
        </div>
        {file && (
          <p className="text-amber-700 text-sm font-medium">
            {t('pdfSelected')} {file.name}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <button
        className="btn-primary w-full"
        onClick={handleSubmit}
        disabled={loading || !file}
      >
        {t('uploadBtn')}
      </button>
    </div>
  );
}

// ── Loading State ─────────────────────────────────────────────────────────────
function LoadingState({ status }) {
  return (
    <div className="flex flex-col items-center gap-6 py-16">
      <div className="relative">
        <Spinner />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
      </div>
      <div className="text-center">
        <p className="text-amber-800 font-semibold text-base animate-pulse">{status}</p>
        <p className="text-stone-400 text-xs mt-1">This may take a few minutes…</p>
      </div>
    </div>
  );
}

// ── Error Message ─────────────────────────────────────────────────────────────
function ErrorMessage({ message, t }) {
  return (
    <div className="error-box flex gap-3 items-start mt-6">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div>
        <p className="font-semibold">{t('errorTitle')}</p>
        <p className="text-sm mt-1">{message}</p>
      </div>
    </div>
  );
}

// ── Chapter Card ──────────────────────────────────────────────────────────────
function ChapterCard({ chapter, index, isExpanded, onToggle, t }) {
  return (
    <div className="chapter-card">
      <div
        className="chapter-card-header"
        onClick={() => onToggle(index)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggle(index)}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500 text-white text-sm font-bold flex items-center justify-center font-serif">
            {index + 1}
          </span>
          <span className="font-serif font-semibold text-stone-800 text-left">{chapter.title}</span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`chevron w-5 h-5 text-amber-600${isExpanded ? ' open' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <div className={`chapter-body${isExpanded ? ' open' : ''}`}>
        <hr className="chapter-section-divider" />

        {/* Summary */}
        <div className="mb-5">
          <div className="section-label">
            <svg className="section-label-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="section-label-text">{t('chapterSummary')}</span>
            <span className="section-label-line" />
          </div>
          <p className="text-stone-700 leading-relaxed text-sm">{chapter.summary}</p>
        </div>

        {/* Takeaways */}
        {chapter.takeaways && chapter.takeaways.length > 0 && (
          <div className="mb-5">
            <div className="section-label">
              <svg className="section-label-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="section-label-text">{t('keyTakeaways')}</span>
              <span className="section-label-line" />
            </div>
            <ul className="space-y-2">
              {chapter.takeaways.map((item, i) => (
                <li key={i} className="takeaway-item">
                  <span className="flex-shrink-0 text-amber-500 font-bold text-xs mt-0.5">▸</span>
                  <span className="text-stone-700 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Key Concepts */}
        {chapter.concepts && chapter.concepts.length > 0 && (
          <div>
            <div className="section-label">
              <svg className="section-label-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="section-label-text">{t('keyConcepts')}</span>
              <span className="section-label-line" />
            </div>
            <div className="space-y-2.5">
              {chapter.concepts.map((c, i) => (
                <div key={i} className="concept-card">
                  <span className="concept-number">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-stone-800 text-sm leading-snug">{c.name}</p>
                    <p className="text-stone-500 text-sm leading-relaxed mt-0.5">{c.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mind Map (D3) ─────────────────────────────────────────────────────────────
function MindMap({ mindMap, t }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!mindMap || !svgRef.current) return;

    // Build a flat hierarchy from the mindMap structure
    // Root → Themes → Chapters → Concepts
    function buildHierarchy(mm) {
      const root = {
        name: mm.title || 'Book',
        children: (mm.themes || []).map((theme) => ({
          name: theme.name,
          children: (theme.chapters || []).map((ch) => ({
            name: ch.name,
            children: (ch.concepts || []).map((c) => ({ name: c })),
          })),
        })),
      };
      return root;
    }

    const hierarchyData = buildHierarchy(mindMap);

    // Dimensions
    const nodeRadius = 8;
    const margin = { top: 20, right: 160, bottom: 20, left: 160 };
    const width = 900 - margin.left - margin.right;

    // Clear previous render
    const svgEl = d3.select(svgRef.current);
    svgEl.selectAll('*').remove();

    // Create root hierarchy
    const root = d3.hierarchy(hierarchyData);

    // Count leaves to determine height
    const leafCount = root.leaves().length;
    const nodeHeight = Math.max(leafCount * 28, 400);

    const svg = svgEl
      .attr('width', width + margin.left + margin.right)
      .attr('height', nodeHeight + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Tree layout
    const treeLayout = d3.tree().size([nodeHeight, width]);

    // Collapse/expand state — store _children on each node
    root.each((d) => {
      d._children = null;
    });

    // Only collapse concept level initially (depth 3)
    root.each((d) => {
      if (d.depth === 2 && d.children) {
        d._children = d.children;
        d.children = null;
      }
    });

    const colorByDepth = ['#d97706', '#f59e0b', '#fbbf24', '#fef3c7'];

    function update(source) {
      treeLayout(root);
      const nodes = root.descendants();
      const links = root.links();

      // Links
      const link = svg.selectAll('.mindmap-link').data(links, (d) => d.target.id || (d.target.id = Math.random()));

      link
        .enter()
        .append('path')
        .attr('class', 'mindmap-link')
        .merge(link)
        .attr('d', d3.linkHorizontal().x((d) => d.y).y((d) => d.x));

      link.exit().remove();

      // Nodes
      const node = svg.selectAll('.mindmap-node').data(nodes, (d) => d.id || (d.id = Math.random()));

      const nodeEnter = node
        .enter()
        .append('g')
        .attr('class', 'mindmap-node')
        .attr('transform', (d) => `translate(${source.y0 || d.y},${source.x0 || d.x})`)
        .on('click', (_event, d) => {
          if (d.children) {
            d._children = d.children;
            d.children = null;
          } else if (d._children) {
            d.children = d._children;
            d._children = null;
          }
          update(d);
        });

      nodeEnter
        .append('circle')
        .attr('r', (d) => nodeRadius - d.depth * 1.2)
        .attr('fill', (d) => colorByDepth[Math.min(d.depth, colorByDepth.length - 1)])
        .attr('stroke', '#92400e')
        .attr('stroke-width', 1.5);

      nodeEnter
        .append('text')
        .attr('dy', '0.31em')
        .attr('x', (d) => (d.children || d._children ? -12 : 12))
        .attr('text-anchor', (d) => (d.children || d._children ? 'end' : 'start'))
        .style('font-size', (d) => `${Math.max(9, 12 - d.depth * 1.5)}px`)
        .style('fill', '#1c1917')
        .text((d) => {
          const maxLen = d.depth === 0 ? 30 : d.depth === 1 ? 25 : 20;
          return d.data.name.length > maxLen ? d.data.name.slice(0, maxLen) + '…' : d.data.name;
        });

      const nodeMerge = nodeEnter.merge(node);
      nodeMerge
        .transition()
        .duration(300)
        .attr('transform', (d) => `translate(${d.y},${d.x})`);

      nodeMerge.select('circle')
        .attr('fill', (d) => (d._children ? '#b45309' : colorByDepth[Math.min(d.depth, colorByDepth.length - 1)]));

      nodeMerge.select('text')
        .attr('x', (d) => (d.children || d._children ? -12 : 12))
        .attr('text-anchor', (d) => (d.children || d._children ? 'end' : 'start'));

      node.exit()
        .transition()
        .duration(200)
        .attr('transform', (d) => `translate(${source.y},${source.x})`)
        .remove();

      nodes.forEach((d) => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
    }

    root.x0 = nodeHeight / 2;
    root.y0 = 0;
    update(root);
  }, [mindMap]);

  if (!mindMap) return null;

  return (
    <div className="mindmap-container p-4">
      <svg ref={svgRef} className="mindmap-svg" />
    </div>
  );
}

// ── PDF Export ────────────────────────────────────────────────────────────────
async function exportToPDF(results, language, svgRef) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (needed = 10) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(146, 64, 14); // amber-800
  doc.text(results.title || 'Book Summary', margin, y);
  y += 10;

  if (results.author) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(120, 80, 20);
    doc.text(results.author, margin, y);
    y += 8;
  }

  // Divider
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Chapters
  for (const [idx, chapter] of (results.chapters || []).entries()) {
    checkPageBreak(20);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(180, 83, 9); // amber-700
    const chapterLabel = `${idx + 1}. ${chapter.title}`;
    const titleLines = doc.splitTextToSize(chapterLabel, contentWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 7 + 2;

    // Summary
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 30, 20);
    const summaryLines = doc.splitTextToSize(chapter.summary || '', contentWidth);
    summaryLines.forEach((line) => {
      checkPageBreak(6);
      doc.text(line, margin, y);
      y += 5.5;
    });
    y += 3;

    // Takeaways
    if (chapter.takeaways && chapter.takeaways.length > 0) {
      checkPageBreak(8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(217, 119, 6);
      doc.text(language === 'zh' ? '核心要点' : 'Key Takeaways', margin, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 30, 20);
      for (const item of chapter.takeaways) {
        const bulletLines = doc.splitTextToSize(`• ${item}`, contentWidth - 4);
        bulletLines.forEach((line) => {
          checkPageBreak(6);
          doc.text(line, margin + 3, y);
          y += 5.5;
        });
      }
    }

    // Key Concepts
    if (chapter.concepts && chapter.concepts.length > 0) {
      checkPageBreak(8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(217, 119, 6);
      doc.text(language === 'zh' ? '核心概念' : 'Key Concepts', margin, y);
      y += 6;

      for (const [ci, c] of chapter.concepts.entries()) {
        checkPageBreak(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(60, 40, 10);
        doc.text(`${ci + 1}. ${c.name}`, margin + 3, y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(40, 30, 20);
        const expLines = doc.splitTextToSize(c.explanation || '', contentWidth - 6);
        expLines.forEach((line) => {
          checkPageBreak(5);
          doc.text(line, margin + 6, y);
          y += 4.8;
        });
        y += 2;
      }
    }

    y += 6;

    // Divider
    checkPageBreak(5);
    doc.setDrawColor(253, 230, 138);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  }

  // Mind map image (best-effort)
  try {
    const svgEl = document.querySelector('.mindmap-svg');
    if (svgEl) {
      const canvas = await html2canvas(svgEl, { backgroundColor: '#ffffff', scale: 1.5 });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height / canvas.width) * imgWidth;

      checkPageBreak(imgHeight + 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(146, 64, 14);
      doc.text(language === 'zh' ? '思维导图' : 'Mind Map', margin, y);
      y += 8;
      doc.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
      y += imgHeight + 5;
    }
  } catch (e) {
    console.warn('Mind map capture failed, omitting from PDF:', e);
  }

  const filename = (results.title || 'booklens-summary').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-') + '.pdf';
  doc.save(filename);
}

// ── Results Section ───────────────────────────────────────────────────────────
function ResultsSection({ results, language, t }) {
  const [expandedChapters, setExpandedChapters] = useState(new Set([0]));
  const [exporting, setExporting] = useState(false);

  const toggleChapter = (idx) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const expandAll = () => setExpandedChapters(new Set((results.chapters || []).map((_, i) => i)));
  const collapseAll = () => setExpandedChapters(new Set());

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportToPDF(results, language);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="results-enter">
      {/* Book header */}
      <div className="book-banner mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="font-serif text-3xl font-bold text-white leading-tight">
              {results.title}
            </h2>
            {results.author && (
              <p className="text-amber-200 font-medium mt-1.5 text-sm">
                {t('author')}: {results.author}
              </p>
            )}
          </div>
          <span className="self-start inline-block px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold uppercase tracking-wider border border-white/30">
            {language === 'en' ? 'English' : '中文'}
          </span>
        </div>
      </div>

      {/* Chapter controls */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-xl font-bold text-stone-800">
          {results.chapters && results.chapters.length} {language === 'zh' ? '个章节' : 'Chapters'}
        </h3>
        <div className="flex gap-1 items-center bg-white border border-amber-200 rounded-lg px-1 py-0.5 shadow-sm">
          <button onClick={expandAll} className="text-xs text-amber-700 hover:text-amber-900 px-2 py-1 rounded hover:bg-amber-50 transition-colors">{t('expandAll')}</button>
          <span className="text-amber-200 text-xs">|</span>
          <button onClick={collapseAll} className="text-xs text-amber-700 hover:text-amber-900 px-2 py-1 rounded hover:bg-amber-50 transition-colors">{t('collapseAll')}</button>
        </div>
      </div>

      {/* Chapter cards */}
      <div className="space-y-3">
        {(results.chapters || []).map((chapter, idx) => (
          <div key={idx} className="chapter-card-enter" style={{ animationDelay: `${idx * 60}ms` }}>
            <ChapterCard
              chapter={chapter}
              index={idx}
              isExpanded={expandedChapters.has(idx)}
              onToggle={toggleChapter}
              t={t}
            />
          </div>
        ))}
      </div>

      {/* Mind map */}
      {results.mindMap && (
        <div className="mt-10">
          <div className="section-label mb-4">
            <svg className="section-label-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            <span className="section-label-text" style={{ fontSize: '0.95rem' }}>{t('mindMapTitle')}</span>
            <span className="section-label-line" />
            <span className="text-xs text-stone-400 italic ml-2 whitespace-nowrap">{t('clickNodeHint')}</span>
          </div>
          <MindMap mindMap={results.mindMap} t={t} />
        </div>
      )}

      {/* Export buttons */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          className="btn-primary flex items-center gap-2 px-6 py-3 text-base"
          onClick={handleExport}
          disabled={exporting}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          {exporting ? t('exportingBtn') : t('exportBtn')}
        </button>
        {results.pdfFilename && (
          <a
            href={`/api/download/${encodeURIComponent(results.pdfFilename)}`}
            download={results.pdfFilename}
            className="btn-primary flex items-center gap-2 px-6 py-3 text-base"
            style={{ textDecoration: 'none' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('downloadServerPdf')}
          </a>
        )}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [language, setLanguage] = useState('en');
  const [activeTab, setActiveTab] = useState('search');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [claudeReady, setClaudeReady] = useState(false);
  const [claudeInitError, setClaudeInitError] = useState(null);

  const t = useTranslation(language);

  // Poll /api/ready until Claude.ai is initialized
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch('/api/ready');
          const data = await res.json();
          if (data.ready) { setClaudeReady(true); return; }
          if (data.error) { setClaudeInitError(data.error); return; }
        } catch {}
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    poll();
    return () => { cancelled = true; };
  }, []);

  const resetState = () => {
    setResults(null);
    setError(null);
  };

  // SSE reader helper
  async function readSSEStream(response, onStatus, onComplete, onError) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'status') onStatus(event.message);
          else if (event.type === 'complete') onComplete(event.result);
          else if (event.type === 'error') onError(event.message);
        } catch {}
      }
    }
  }

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setLoadingStatus('Starting…');

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, language }),
      });

      await readSSEStream(
        response,
        (msg) => setLoadingStatus(msg),
        (result) => { setResults(result); setLoading(false); },
        (msg) => { setError(msg); setLoading(false); }
      );
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleUpload = async (file) => {
    setLoading(true);
    setError(null);
    setResults(null);
    setLoadingStatus('Starting…');

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('language', language);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      await readSSEStream(
        response,
        (msg) => setLoadingStatus(msg),
        (result) => { setResults(result); setLoading(false); },
        (msg) => { setError(msg); setLoading(false); }
      );
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    resetState();
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#faf7f0' }}>
      <Header t={t} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">

        {/* Readiness banner */}
        {!claudeReady && !claudeInitError && (
          <div className="flex items-center gap-3 bg-amber-100 border border-amber-300 text-amber-800 rounded-xl px-5 py-4 mb-6 shadow-sm">
            <Spinner />
            <div>
              <p className="font-semibold text-sm">Connecting to Claude.ai…</p>
              <p className="text-xs mt-0.5 text-amber-700">This takes a few seconds on first load.</p>
            </div>
          </div>
        )}
        {claudeInitError && (
          <div className="bg-red-50 border border-red-300 text-red-800 rounded-xl px-5 py-4 mb-6">
            <p className="font-semibold">Service unavailable</p>
            <p className="text-sm mt-1">{claudeInitError}</p>
          </div>
        )}

        {/* Input Card */}
        <div className="bg-white rounded-2xl border border-amber-100 p-6 mb-8" style={{ boxShadow: '0 4px 24px rgba(120,53,15,0.08), 0 1px 4px rgba(0,0,0,0.04)' }}>
          <TabSelector activeTab={activeTab} onTabChange={handleTabChange} t={t} />

          <OutputLanguageSelector language={language} onToggle={setLanguage} t={t} />

          {activeTab === 'search' ? (
            <SearchInput
              query={query}
              onQueryChange={setQuery}
              onSubmit={handleSearch}
              loading={loading}
              t={t}
            />
          ) : (
            <PDFUploader onSubmit={handleUpload} loading={loading} t={t} />
          )}
        </div>

        {/* Loading */}
        {loading && <LoadingState status={loadingStatus} />}

        {/* Error */}
        {!loading && error && <ErrorMessage message={error} t={t} />}

        {/* Results */}
        {!loading && results && (
          <ResultsSection results={results} language={language} t={t} />
        )}
      </main>

      <footer className="text-center py-6 text-stone-400 text-xs safe-bottom">
        BookLens &copy; {new Date().getFullYear()} &mdash; Powered by Claude AI
      </footer>
    </div>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
