import type { LibrarySong } from "../lib/types";
import type { Dialect } from "../lib/translit";
import { occasionLabel, secondaryTitle, traditionLabel } from "../lib/format";
import { joinClassNames } from "../lib/format";
import { ListAddIcon, MusicIcon, StarIcon, VideoIcon } from "./Icons";

interface SongCardProps {
  song: LibrarySong;
  dialect: Dialect;
  active?: boolean;
  favourite?: boolean;
  onToggleFavourite?: (id: number) => void;
  onAddToSetlist?: (song: LibrarySong) => void;
  onFocus?: () => void;
  onMouseEnter?: () => void;
}

export function SongCard({
  song,
  dialect,
  active,
  favourite = false,
  onToggleFavourite,
  onAddToSetlist,
  onFocus,
  onMouseEnter,
}: SongCardProps) {
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
  const name = song.titleEn || translit || song.titleHe || "Song";

  // The card is a div with a full-size link behind its content, so the
  // favourite and setlist buttons can sit inside it without nesting
  // interactive elements in an anchor.
  return (
    <div
      className={joinClassNames("song-card", active && "is-active")}
      data-song-id={song.id}
      onMouseEnter={onMouseEnter}
    >
      <a
        className="song-card-link"
        id={`song-result-${song.id}`}
        href={`#/song/${song.id}`}
        aria-label={`${name}${song.titleHe ? `, Hebrew title ${song.titleHe}` : ""}`}
        onFocus={onFocus}
      />
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
      {(onToggleFavourite || onAddToSetlist) && (
        <div className="song-card-tools">
          {onToggleFavourite && (
            <button
              type="button"
              className={joinClassNames("card-tool", favourite && "is-on")}
              aria-pressed={favourite}
              aria-label={favourite ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
              title={favourite ? "Remove from favourites" : "Add to favourites"}
              onClick={() => onToggleFavourite(song.id)}
            >
              <StarIcon width={16} height={16} filled={favourite} />
            </button>
          )}
          {onAddToSetlist && (
            <button
              type="button"
              className="card-tool"
              aria-label={`Add ${name} to a setlist`}
              title="Add to setlist"
              onClick={() => onAddToSetlist(song)}
            >
              <ListAddIcon width={16} height={16} />
            </button>
          )}
        </div>
      )}
      <span className="song-card-arrow" aria-hidden="true">
        →
      </span>
    </div>
  );
}
