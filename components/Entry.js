import Markdown from 'react-markdown';
import { dateLabel, timeLabel } from '../lib/entries';

function safeImage(src) { return /^\/media\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:jpe?g|png|webp|gif|avif)$/i.test(src || ''); }
export default function Entry({ entry }) {
  return <article className={`entry entry-${entry.kind || 'dump'}`} id={entry.id} lang={entry.lang || 'en'}>
    <div className="entry-date">
      <a href={`#${entry.id}`} aria-label={`entry from ${dateLabel(entry.date)}`}>
        <time dateTime={`${entry.date}${entry.time ? 'T' + entry.time + '+07:00' : ''}`}>{dateLabel(entry.date)}</time>
      </a>
      {entry.time && <span>{timeLabel(entry.time)}</span>}
    </div>
    <div className="entry-body">
      {entry.title && <h2>{entry.title}</h2>}
      {entry.song && <div className="song">
        {entry.song.art && safeImage(entry.song.art) && <img className="song-art" src={entry.song.art} alt="" loading="lazy" decoding="async" />}
        <span className="song-label">on repeat</span>
        <h2>{entry.song.title}</h2>
        <p className="artist">{entry.song.artist}</p>
        {entry.song.lyric && <blockquote className="lyric">{entry.song.lyric}</blockquote>}
        {entry.song.url && /^https:\/\//.test(entry.song.url) && <a className="listen" href={entry.song.url} target="_blank" rel="noopener noreferrer">listen <span className="sr-only">(opens a new tab)</span></a>}
      </div>}
      <div className="writing"><Markdown components={{
        a: ({ children, href }) => <a href={href} target={href?.startsWith('https:') ? '_blank' : undefined} rel="noopener noreferrer">{children}</a>,
        p: ({ children, node }) => node?.children?.some(child => child.tagName === 'img') ? <div className="photo-line">{children}</div> : <p>{children}</p>,
        img: ({ src, alt, title }) => safeImage(src) ? <figure><img src={src} alt={alt || ''} loading="lazy" decoding="async" />{title && <figcaption>{title}</figcaption>}</figure> : null,
      }}>{entry.content}</Markdown></div>
      {entry.tags?.length > 0 && <ul className="tags" aria-label="entry tags">{entry.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}
    </div>
  </article>;
}
