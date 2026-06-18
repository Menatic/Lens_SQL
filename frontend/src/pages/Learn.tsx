import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LESSONS } from '../data/lessons';
import type { Lesson } from '../data/lessons';

function getProgress(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('lens_progress') ?? '{}');
  } catch {
    return {};
  }
}

const DIFF_COLOR: Record<string, string> = {
  beginner:     '#3fb950',
  intermediate: '#d29922',
  advanced:     '#f85149',
};

const DIFF_BG: Record<string, string> = {
  beginner:     'rgba(63,185,80,0.1)',
  intermediate: 'rgba(210,153,34,0.1)',
  advanced:     'rgba(248,81,73,0.1)',
};

const CAT_ICONS: Record<string, string> = {
  beginner:     '🌱',
  intermediate: '⚡',
  advanced:     '🔬',
};

function LessonCard({ lesson, done }: { lesson: Lesson; done: boolean }) {
  return (
    <Link to={`/learn/${lesson.id}`} className="lesson-card" style={{ textDecoration: 'none' }}>
      <div className="lesson-card-inner" style={{ '--diff-color': DIFF_COLOR[lesson.difficulty] } as React.CSSProperties}>
        {/* Number */}
        <div className="lc-number" style={{
          color: done ? DIFF_COLOR[lesson.difficulty] : '#30363d',
        }}>
          {done ? '✓' : lesson.id.split('-')[0]}
        </div>

        {/* Content */}
        <div className="lc-content">
          <div className="lc-header">
            <span className="lc-difficulty" style={{
              color:       DIFF_COLOR[lesson.difficulty],
              background:  DIFF_BG[lesson.difficulty],
            }}>
              {CAT_ICONS[lesson.difficulty]} {lesson.difficulty}
            </span>
            <span className="lc-duration">{lesson.duration}</span>
          </div>

          <h3 className="lc-title">{lesson.title}</h3>
          <p className="lc-sub">{lesson.subtitle}</p>

          {/* Key concepts */}
          <div className="lc-concepts">
            {lesson.concepts.slice(0, 3).map(c => (
              <span key={c} className="lc-concept">{c}</span>
            ))}
          </div>

          {/* Operators */}
          <div className="lc-operators">
            {lesson.keyOperators.slice(0, 4).map(op => (
              <span key={op} className="lc-op">{op}</span>
            ))}
          </div>
        </div>

        <div className="lc-arrow">→</div>
      </div>
    </Link>
  );
}

export default function Learn() {
  const [progress, setProgress] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setProgress(getProgress());
  }, []);

  const done      = Object.values(progress).filter(Boolean).length;
  const total     = LESSONS.length;
  const pct       = Math.round((done / total) * 100);

  const beginners     = LESSONS.filter(l => l.difficulty === 'beginner');
  const intermediates = LESSONS.filter(l => l.difficulty === 'intermediate');
  const advanced      = LESSONS.filter(l => l.difficulty === 'advanced');

  return (
    <div className="learn-page">
      {/* Nav */}
      <nav className="lnav lnav-inner">
        <Link to="/" className="lnav-brand" style={{ textDecoration: 'none' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="10" cy="10" r="7" stroke="#58a6ff" strokeWidth="2" />
            <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" />
            <circle cx="10" cy="10" r="3" fill="#58a6ff" opacity="0.3" />
          </svg>
          <span>Lens</span>
        </Link>
        <div className="lnav-links">
          <Link to="/learn" style={{ color: 'var(--blue)' }}>Learn</Link>
          <Link to="/playground">Playground</Link>
        </div>
      </nav>

      <div className="learn-body">
        {/* Header */}
        <div className="learn-header">
          <div className="section-eyebrow">Learning path</div>
          <h1 className="learn-title">SQL Execution Engine Mastery</h1>
          <p className="learn-sub">
            10 hands-on lessons. Each one opens a live playground with a pre-loaded query
            and a challenge. No slides, no videos — just SQL and the plan tree.
          </p>

          {/* Progress */}
          {done > 0 && (
            <div className="progress-track">
              <div className="progress-label">
                <span>{done} of {total} lessons complete</span>
                <span style={{ color: 'var(--blue)' }}>{pct}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {done === 0 && (
            <Link to={`/learn/${LESSONS[0].id}`} className="btn-primary" style={{ marginTop: 16 }}>
              Start Lesson 01 →
            </Link>
          )}
          {done > 0 && done < total && (
            <Link
              to={`/learn/${LESSONS[done]?.id ?? LESSONS[0].id}`}
              className="btn-primary"
              style={{ marginTop: 16 }}
            >
              Continue →
            </Link>
          )}
          {done === total && (
            <div style={{ marginTop: 16, color: '#3fb950', fontWeight: 600 }}>
              🎉 Course complete!
            </div>
          )}
        </div>

        {/* Sections */}
        {[
          { label: '🌱 Beginner',     lessons: beginners     },
          { label: '⚡ Intermediate', lessons: intermediates },
          { label: '🔬 Advanced',     lessons: advanced      },
        ].map(section => (
          <div key={section.label} className="learn-section">
            <div className="learn-section-label">{section.label}</div>
            <div className="lesson-grid">
              {section.lessons.map(l => (
                <LessonCard key={l.id} lesson={l} done={!!progress[l.id]} />
              ))}
            </div>
          </div>
        ))}

        {/* Quick-jump to playground */}
        <div className="learn-playground-cta">
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              Prefer to explore on your own?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              Open the playground with full Monaco editor, schema explorer, and sample queries.
            </div>
          </div>
          <Link to="/playground" className="btn-ghost">
            Open Playground →
          </Link>
        </div>
      </div>
    </div>
  );
}
