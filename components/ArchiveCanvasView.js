'use client';

import { useState } from 'react';

function dateLabel(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`)).toLowerCase();
}

function timeLabel(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}

function paragraphs(content) {
  return (content || '—').split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>);
}

function tilt(id) {
  const total = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return `${(total % 7) - 3}deg`;
}

function itemStyle(item, archive) {
  return {
    left: `${item.x / archive.canvas.width * 100}%`,
    top: `${item.y / archive.canvas.height * 100}%`,
    width: `${item.width / archive.canvas.width * 100}%`,
    ...(item.type === 'image' ? { '--tilt': tilt(item.id) } : {}),
  };
}

function YoutubePlayer({ item, archive }) {
  const [playing, setPlaying] = useState(false);
  return <div className="canvas-item youtube-sticky youtube-sticky-view" style={itemStyle(item, archive)}>
    <div className="youtube-frame">
      {playing ? <iframe
        src={`https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1&rel=0`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      /> : <button className="youtube-placeholder" type="button" onClick={() => setPlaying(true)} aria-label="play YouTube video in this archive">
        <span className="youtube-play" aria-hidden="true">▶</span>
        <span>play here</span>
      </button>}
    </div>
    <div className="youtube-card-label"><span>youtube</span>{playing && <small>playing in archive</small>}</div>
  </div>;
}

export default function ArchiveCanvasView({ archive }) {
  return <div className="archive-canvas viewer-canvas wysiwyg-canvas" style={{ aspectRatio: `${archive.canvas.width} / ${archive.canvas.height}` }}>
    {!archive.items.length && <p className="viewer-empty">nothing here yet.</p>}
    {archive.items.map(item => item.type === 'note' ? <article
      key={item.id}
      className="canvas-note canvas-entry canvas-note-view"
      style={itemStyle(item, archive)}
      lang="en"
    >
      <div className="note-meta">
        <time dateTime={`${item.date}${item.time ? `T${item.time}+07:00` : ''}`}>{dateLabel(item.date)}</time>
        {item.time && <span>{timeLabel(item.time)}</span>}
      </div>
      <div className="note-content">{paragraphs(item.content)}</div>
    </article> : item.type === 'youtube' ? <YoutubePlayer key={item.id} item={item} archive={archive} /> : <figure
      key={item.id}
      className="canvas-item sticky-photo sticky-photo-view"
      style={itemStyle(item, archive)}
    >
      <img src={`/api/archive-media/${archive.id}/${item.fileName}`} alt={item.alt || ''} loading="lazy" decoding="async" />
    </figure>)}
  </div>;
}
