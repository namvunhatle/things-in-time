export default function ArchiveCanvasView({ archive }) {
  return <div className="archive-canvas viewer-canvas" style={{ aspectRatio: `${archive.canvas.width} / ${archive.canvas.height}` }}>
    {!archive.items.length && <p className="viewer-empty">nothing here yet.</p>}
    {archive.items.map(item => <div
      key={item.id}
      className="canvas-item canvas-item-view"
      style={{ left: `${item.x / archive.canvas.width * 100}%`, top: `${item.y / archive.canvas.height * 100}%`, width: `${item.width / archive.canvas.width * 100}%` }}
    >
      <img src={`/api/archive-media/${archive.id}/${item.fileName}`} alt={item.alt || ''} />
    </div>)}
  </div>;
}
