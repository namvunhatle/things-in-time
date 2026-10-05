const itemStyle = (item, archive) => ({
  left: `${item.x / archive.canvas.width * 100}%`,
  top: `${item.y / archive.canvas.height * 100}%`,
  width: `${item.width / archive.canvas.width * 100}%`,
});

function noteDate(item) {
  const date = new Date(`${item.date}T${item.time || '00:00'}:00`);
  if (Number.isNaN(date.getTime())) return [item.date, item.time].filter(Boolean).join(' · ');
  return new Intl.DateTimeFormat('en', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: item.time ? 'numeric' : undefined,
    minute: item.time ? '2-digit' : undefined,
  }).format(date).toLowerCase();
}

export default function ArchiveCanvasView({ archive }) {
  return <div className="archive-canvas viewer-canvas" style={{ aspectRatio: `${archive.canvas.width} / ${archive.canvas.height}` }}>
    {!archive.items.length && <p className="viewer-empty">nothing here yet.</p>}
    {archive.items.map(item => item.type === 'note' ? <article key={item.id} className="canvas-note canvas-note-view" style={itemStyle(item, archive)}>
      <p className="note-date">{noteDate(item)}</p>
      <div className="note-content">{item.content || '—'}</div>
    </article> : <div key={item.id} className="canvas-item canvas-item-view" style={itemStyle(item, archive)}>
      <img src={`/api/archive-media/${archive.id}/${item.fileName}`} alt={item.alt || ''} />
    </div>)}
  </div>;
}
