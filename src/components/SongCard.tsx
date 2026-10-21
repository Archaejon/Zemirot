import type { LibrarySong } from "../lib/types";
import type { Dialect } from "../lib/translit";
import { occasionLabel, secondaryTitle, traditionLabel } from "../lib/format";
import { MusicIcon, VideoIcon } from "./Icons";

interface SongCardProps {
  song: LibrarySong;
  dialect: Dialect;
  active?: boolean;
  onFocus?: () => void;
  onMouseEnter?: () => void;
}

export function SongCard({ song, dialect, active, onFocus, onMouseEnter }: SongCardProps) {
  const translit = secondaryTitle(song, dialect);
  const tags = [
    ...song.occasions.slice(0, 2).map((slug) => ({
      slug: `occasion-${slug}`,
      label: occasionLabel(slug),
    })),
    ...song.traditions.slice(0, 2).map((slug) => ({
      slug: `tradition-${slug}`,
      label: traditionLabel(slug),
    })),
  ].slice(0, 3);

  const displayTitle = song.titleHe || song.titleEn || translit || "Untitled";

  return (
    <a
      href={`#/song/${song.id}`}
      className={`song-card${active ? " is-active" : ""}`}
      id={`song-result-${song.id}`}
      aria-label={`${song.titleEn || translit || song.titleHe || "Song"}${
        song.titleHe ? `, Hebrew title ${song.titleHe}` : ""
      }`}
      onFocus={onFocus}
      onMouseEnter={onMouseEnter}
      data-song-id={song.id}
    >
      <div className="song-card-body">
        <div className="song-card-heading">
          {song.titleEn && <h3 className="song-card-title">{song.titleEn}</h3>}
          {translit && (
            <p className="song-card-translit" lang="en">
              {translit}
            </p>
          )}
          {!song.titleEn && !song.titleHe && (
            <h3 className="song-card-title song-card-title--fallback">{displayTitle}</h3>
          )}
          {song.titleHe && (
            <p className="song-card-hebrew" lang="he" dir="rtl">
              {song.titleHe}
            </p>
          )}
        </div>

        <div className="song-card-foot">
          <div className="song-card-tags">
            {tags.map((tag) => (
              <span className="tag tag--quiet" key={tag.slug}>
                {tag.label}
              </span>
            ))}
            {song.language === "yi" && <span className="tag tag--language">Yiddish</span>}
          </div>
          <div className="song-card-media">
            {song.hasAudio && (
              <span className="media-mark" title="Recording available">
                <MusicIcon width={15} height={15} />
                <span className="sr-only">Recording available</span>
              </span>
            )}
            {song.hasVideo && (
              <span className="media-mark" title="Video available">
                <VideoIcon width={15} height={15} />
                <span className="sr-only">Video available</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <span className="song-card-arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}
