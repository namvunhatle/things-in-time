const itemStyle = (item, archive) => ({
  left: `${item.x / archive.canvas.width * 100}%`,
  top: `${item.y / archive.canvas.height * 100}%`,
  width: `${item.width / archive.canvas.width * 100}%`,
});

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

export default function ArchiveCanvasView({ archive }) {
  return <div className="archive-canvas viewer-canvas" style={{ aspectRatio: `${archive.canvas.width} / ${archive.canvas.height}` }}>
    {!archive.items.length && <p className="viewer-empty">nothing here yet.</p>}
    {archive.items.map(item => item.type === 'note' ? <article key={item.id} className="canvas-note canvas-entry canvas-note-view" style={itemStyle(item, archive)}>
      <div className="note-meta">
        <time dateTime={`${item.date}${item.time ? `T${item.time}+07:00` : ''}`}>{dateLabel(item.date)}</time>
        {item.time && <span>{timeLabel(item.time)}</span>}
      </div>
      <div className="note-content">{paragraphs(item.content)}</div>
    </article> : <div key={item.id} className="canvas-item canvas-item-view" style={itemStyle(item, archive)}>
      <img src={`/api/archive-media/${archive.id}/${item.fileName}`} alt={item.alt || ''} />
    </div>)}
  </div>;
}
