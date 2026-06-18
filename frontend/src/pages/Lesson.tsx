import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import PlanTree from '../components/PlanTree';
import ResultsTable from '../components/ResultsTable';
import StatsBar from '../components/StatsBar';
import { useExecution } from '../hooks/useExecution';
import { LESSONS, LESSON_MAP } from '../data/lessons';
import type { Lesson } from '../data/lessons';

function markDone(id: string) {
  try {
    const p = JSON.parse(localStorage.getItem('lens_progress') ?? '{}');
    p[id] = true;
    localStorage.setItem('lens_progress', JSON.stringify(p));
  } catch {}
}

const DIFF_COLOR: Record<string, string> = {
  beginner:     '#3fb950',
  intermediate: '#d29922',
  advanced:     '#f85149',
};

export default function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();

  const lesson: Lesson | undefined = lessonId ? LESSON_MAP[lessonId] : undefined;
  const lessonIndex = lesson ? LESSONS.findIndex(l => l.id === lesson.id) : -1;
  const prevLesson = lessonIndex > 0 ? LESSONS[lessonIndex - 1] : null;
  const nextLesson = lesson?.next ? LESSON_MAP[lesson.next] : null;

  const { state, run, cancel } = useExecution();
  const [sql, setSql] = useState('');
  const [tab, setTab] = useState<'plan' | 'results'>('plan');
  const [showHints, setShowHints] = useState(false);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Load lesson SQL on mount / lesson change
  useEffect(() => {
    if (lesson) {
      setSql(lesson.initialSql);
      editorRef.current?.setValue(lesson.initialSql);
      setTab('plan');
      setShowHints(false);
    }
  }, [lesson?.id]);

  // Auto-switch tabs
  useEffect(() => {
    if (state.status === 'done') {
      setTab('results');
      if (lesson) markDone(lesson.id);
    }
  }, [state.status]);

  useEffect(() => {
    if (state.status === 'planning' || state.status === 'running') {
      setTab('plan');
    }
  }, [state.status]);

  const handleRun = useCallback(() => {
    const query = editorRef.current?.getValue() ?? sql;
    if (!query.trim()) return;
    run(query.trim());
  }, [run, sql]);

  const handleEditorMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    editor.addCommand(2048 | 3, () => {
      const q = editor.getValue().trim();
      if (q) run(q);
    });
  }, [run]);

  const isRunning = state.status === 'planning' || state.status === 'running';

  if (!lesson) {
    return (
      <div style={{ padding: 40, color: 'var(--text2)' }}>
        Lesson not found. <Link to="/learn" style={{ color: 'var(--blue)' }}>Back to lessons</Link>
      </div>
    );
  }

  return (
    <div style={{
      display:       'grid',
      gridTemplateRows: '48px 1fr 32px',
      height:        '100vh',
      overflow:      'hidden',
      background:    'var(--bg)',
    }}>
      {/* HEADER */}
      <header style={{
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        padding:      '0 16px',
        background:   'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink:   0,
      }}>
        <Link to="/learn" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="10" cy="10" r="7" stroke="#58a6ff" strokeWidth="2" />
            <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" />
            <circle cx="10" cy="10" r="3" fill="#58a6ff" opacity="0.3" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Lens</span>
        </Link>

        <span style={{ color: 'var(--border)', fontSize: 16 }}>›</span>
        <Link to="/learn" style={{ color: 'var(--text2)', textDecoration: 'none', fontSize: 12 }}>
          Learn
        </Link>
        <span style={{ color: 'var(--border)', fontSize: 16 }}>›</span>
        <span style={{ fontSize: 12, color: 'var(--text)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lesson.id.split('-')[0]} · {lesson.title}
        </span>

        <span style={{ flex: 1 }} />

        {/* Lesson nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {prevLesson && (
            <button
              onClick={() => navigate(`/learn/${prevLesson.id}`)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              ← Prev
            </button>
          )}
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            {lessonIndex + 1} / {LESSONS.length}
          </span>
          {nextLesson && (
            <button
              onClick={() => navigate(`/learn/${nextLesson.id}`)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              Next →
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Run */}
        <button
          onClick={isRunning ? cancel : handleRun}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          6,
            padding:      '5px 14px',
            background:   isRunning ? 'transparent' : 'var(--green)',
            color:        isRunning ? 'var(--red)' : '#fff',
            border:       isRunning ? '1px solid var(--red)' : '1px solid transparent',
            borderRadius: 4,
            cursor:       'pointer',
            fontSize:     12,
            fontWeight:   600,
          }}
        >
          {isRunning ? '■ Cancel' : '▶ Run'}
          {!isRunning && <span style={{ fontSize: 10, opacity: 0.7 }}>⌘↵</span>}
        </button>
      </header>

      {/* WORKSPACE */}
      <div style={{ display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* LEFT PANEL: lesson content */}
        <div style={{
          width:        340,
          flexShrink:   0,
          borderRight:  '1px solid var(--border)',
          overflowY:    'auto',
          display:      'flex',
          flexDirection: 'column',
        }}>
          {/* Lesson header */}
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                fontSize:   10,
                fontWeight: 600,
                padding:    '2px 8px',
                borderRadius: 20,
                color:      DIFF_COLOR[lesson.difficulty],
                background: DIFF_COLOR[lesson.difficulty] + '1a',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {lesson.difficulty}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{lesson.duration}</span>
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.3 }}>
              {lesson.title}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
              {lesson.subtitle}
            </p>
          </div>

          {/* Theory */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            {lesson.theory.map(t => (
              <div key={t.heading} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                  {t.heading}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0, lineHeight: 1.65 }}>
                  {t.body.split(/\*(.+?)\*/g).map((part, i) =>
                    i % 2 === 1
                      ? <em key={i} style={{ color: 'var(--blue)', fontStyle: 'normal', fontWeight: 600 }}>{part}</em>
                      : part
                  )}
                </p>
              </div>
            ))}
          </div>

          {/* Challenge */}
          <div style={{ padding: '16px 20px', background: 'rgba(88,166,255,0.05)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginBottom: 8, letterSpacing: '0.06em' }}>
              CHALLENGE
            </div>
            <p style={{ fontSize: 12, color: 'var(--text)', margin: '0 0 12px', lineHeight: 1.65 }}>
              {lesson.challenge}
            </p>

            <button
              onClick={() => setShowHints(h => !h)}
              style={{
                background:   'transparent',
                border:       '1px solid var(--border)',
                color:        'var(--text2)',
                padding:      '4px 10px',
                borderRadius: 4,
                cursor:       'pointer',
                fontSize:     11,
              }}
            >
              {showHints ? 'Hide hints' : 'Show hints'}
            </button>

            {showHints && (
              <ul style={{ margin: '12px 0 0', padding: '0 0 0 16px', listStyle: 'disc' }}>
                {lesson.hints.map(h => (
                  <li key={h} style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, lineHeight: 1.5 }}>
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Key operators */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 8, letterSpacing: '0.06em' }}>
              KEY OPERATORS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {lesson.keyOperators.map(op => (
                <span key={op} style={{
                  fontSize:     10,
                  fontFamily:   'var(--mono)',
                  color:        'var(--amber)',
                  background:   'rgba(210,153,34,0.1)',
                  padding:      '3px 8px',
                  borderRadius: 4,
                  border:       '1px solid rgba(210,153,34,0.2)',
                }}>
                  {op}
                </span>
              ))}
            </div>
          </div>

          {/* Complete / Next */}
          <div style={{ padding: '16px 20px', marginTop: 'auto' }}>
            {state.status === 'done' && (
              <div style={{ marginBottom: 12, color: '#3fb950', fontSize: 12, fontWeight: 600 }}>
                ✓ Lesson recorded as complete
              </div>
            )}
            {nextLesson && (
              <button
                onClick={() => navigate(`/learn/${nextLesson.id}`)}
                style={{
                  width:        '100%',
                  padding:      '9px 16px',
                  background:   'var(--blue)',
                  color:        '#fff',
                  border:       'none',
                  borderRadius: 6,
                  cursor:       'pointer',
                  fontSize:     13,
                  fontWeight:   600,
                }}
              >
                Next: {nextLesson.title} →
              </button>
            )}
            {!nextLesson && (
              <Link
                to="/learn"
                style={{
                  display:      'block',
                  textAlign:    'center',
                  padding:      '9px 16px',
                  background:   '#3fb950',
                  color:        '#fff',
                  borderRadius: 6,
                  fontSize:     13,
                  fontWeight:   600,
                  textDecoration: 'none',
                }}
              >
                🎉 Course complete — back to lessons
              </Link>
            )}
          </div>
        </div>

        {/* MIDDLE: editor */}
        <div style={{
          flex:          1,
          display:       'flex',
          flexDirection: 'column',
          borderRight:   '1px solid var(--border)',
          overflow:      'hidden',
          minWidth:      280,
        }}>
          <div style={{
            padding:      '6px 12px',
            borderBottom: '1px solid var(--border)',
            fontSize:     11,
            fontWeight:   600,
            letterSpacing: '0.06em',
            color:        'var(--text2)',
            background:   'var(--surface)',
            flexShrink:   0,
          }}>
            SQL EDITOR
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Editor
              defaultLanguage="sql"
              value={sql}
              onChange={v => setSql(v ?? '')}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize:             13,
                fontFamily:           "'JetBrains Mono', Consolas, monospace",
                minimap:              { enabled: false },
                lineNumbers:          'on',
                scrollBeyondLastLine: false,
                wordWrap:             'on',
                padding:              { top: 12 },
                scrollbar:            { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
                overviewRulerLanes:   0,
              }}
            />
          </div>
        </div>

        {/* RIGHT: plan + results */}
        <div style={{
          flex:          1.2,
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          minWidth:      0,
        }}>
          {/* Tabs */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            borderBottom: '1px solid var(--border)',
            background:   'var(--surface)',
            flexShrink:   0,
            paddingLeft:  4,
          }}>
            {(['plan', 'results'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding:      '8px 16px',
                background:   'transparent',
                border:       'none',
                borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
                color:        tab === t ? 'var(--text)' : 'var(--text2)',
                cursor:       'pointer',
                fontSize:     11,
                fontWeight:   tab === t ? 600 : 400,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                {t === 'plan' ? 'Execution Plan' : `Results${state.totalRows > 0 ? ` (${state.totalRows.toLocaleString()})` : ''}`}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: 'hidden', display: tab === 'plan' ? 'block' : 'none' }}>
            <PlanTree plan={state.plan} statsPlan={state.statsPlan} status={state.status} />
          </div>
          <div style={{ flex: 1, overflow: 'hidden', display: tab === 'results' ? 'flex' : 'none', flexDirection: 'column' }}>
            <ResultsTable columns={state.columns} rows={state.rows} total={state.totalRows} />
          </div>
        </div>
      </div>

      {/* STATUS BAR */}
      <StatsBar
        status={state.status}
        rowsDone={state.rowsDone}
        totalRows={state.totalRows}
        elapsedMs={state.elapsedMs}
        error={state.error}
      />
    </div>
  );
}
