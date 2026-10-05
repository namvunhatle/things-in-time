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

export default function ArchiveCanvasView({ archive }) {
  const notes = archive.items
    .filter(item => item.type === 'note')
    .sort((left, right) => `${right.date}T${right.time || '23:59'}`.localeCompare(`${left.date}T${left.time || '23:59'}`));
  const images = archive.items.filter(item => item.type === 'image');

  if (!notes.length && !images.length) return <p className="empty archive-feed-empty">nothing here yet.</p>;

  return <div className="archive-feed-stage" style={{ minHeight: `${archive.canvas.height}px` }}>
    <div className="archive-feed" aria-label="chronological archive entries">
      {notes.map(note => <article className="entry" id={note.id} key={note.id} lang="en">
        <div className="entry-date">
          <a href={`#${note.id}`} aria-label={`entry from ${dateLabel(note.date)}`}>
            <time dateTime={`${note.date}${note.time ? `T${note.time}+07:00` : ''}`}>{dateLabel(note.date)}</time>
          </a>
          {note.time && <span>{timeLabel(note.time)}</span>}
        </div>
        <div className="entry-body"><div className="writing">{paragraphs(note.content)}</div></div>
      </article>)}
    </div>
    <div className="archive-sticky-layer" aria-label="attached photos">
      {images.map(image => <figure
        className="canvas-item sticky-photo sticky-photo-view"
        key={image.id}
        style={{ left: `${image.x}px`, top: `${image.y}px`, width: `${image.width}px`, '--tilt': tilt(image.id) }}
      >
        <img src={`/api/archive-media/${archive.id}/${image.fileName}`} alt={image.alt || ''} loading="lazy" decoding="async" />
      </figure>)}
    </div>
  </div>;
}
