import React from 'react';
import { X, Check, Disc, Volume2, Sparkles, ChevronRight } from 'lucide-react';
import { SCENES, PACKS } from '../data/scenes';

export default function DockDrawer({
  isOpen,
  onClose,
  currentScene,
  onSelectScene,
  isSimulated,
  onToggleSimulated,
  onOpenPreview,
  wheelSide = 'left'
}) {
  return (
    <>
      {/* Backdrop scrim */}
      <div
        className={`dockScrim ${isOpen ? 'dockScrim--open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`dockDrawer ${isOpen ? 'dockDrawer--open' : ''} ${wheelSide === 'right' ? 'dockDrawer--isRight' : ''}`}>
        <div className="dockDrawer__header">
          <div className="dockDrawer__titleBlock">
            <h2 className="dockDrawer__title">Soundscapes</h2>
            <span className="dockDrawer__subtitle">
              {SCENES.length} Scenes · All Unlocked
            </span>
          </div>
          <button
            type="button"
            className="dockDrawer__closeButton"
            onClick={onClose}
            aria-label="Close scenes dock"
          >
            <X size={18} />
          </button>
        </div>

        {/* Simulation Mode switch inside drawer */}
        <div className="dockDrawer__simBlock">
          <div className="dockDrawer__simInfo">
            <span className="dockDrawer__simTitle">Simulation Throttle</span>
            <span className="dockDrawer__simHint">Accelerate & rev stationary in browser</span>
          </div>
          <button
            type="button"
            className={`dockDrawer__switch ${isSimulated ? 'dockDrawer__switch--on' : ''}`}
            onClick={onToggleSimulated}
            aria-pressed={isSimulated}
          >
            <span className="dockDrawer__knob" />
          </button>
        </div>

        <div className="dockDrawer__content">
          {PACKS.map((pack) => {
            const packScenes = SCENES.filter((s) => pack.sceneIds.includes(s.id));
            if (!packScenes.length) return null;

            return (
              <div key={pack.id} className="dockGroup">
                <div className="dockGroup__legend">
                  <div className="dockGroup__legendLeft">
                    <span className="dockGroup__label">{pack.name}</span>
                    <span className="dockGroup__count">{packScenes.length} scenes</span>
                  </div>

                  <button
                    type="button"
                    className="dockGroup__unlockBtn"
                    onClick={() => onOpenPreview && onOpenPreview(pack, packScenes[0])}
                    title="Audition sound loop & speed reaction"
                  >
                    <Volume2 size={13} />
                    <span>Audition Pack</span>
                  </button>
                </div>

                <div className="dockGroup__grid">
                  {packScenes.map((item) => {
                    const isSelected = item.id === currentScene.id;

                    return (
                      <div
                        key={item.id}
                        className={`sceneCard ${isSelected ? 'sceneCard--selected' : ''}`}
                        onClick={() => onSelectScene(item)}
                        style={{ '--card-accent': item.accent }}
                      >
                        <div className="sceneCard__preview">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="sceneCard__image"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.src = `/images/${item.id}.webp`;
                            }}
                          />
                          <div className="sceneCard__badges">
                            {item.hasManual && (
                              <span className="sceneCard__badge" title="Manual Transmission Supported">
                                Manual
                              </span>
                            )}
                            {item.hasMusic && (
                              <span className="sceneCard__badge sceneCard__badge--music" title="Lo-fi Music Scene">
                                <Disc size={11} /> Lo-fi
                              </span>
                            )}
                          </div>

                          {/* Sound Audition Button */}
                          <button
                            type="button"
                            className="sceneCard__auditionBtn"
                            title="Preview engine sound & speed curve"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenPreview) onOpenPreview(pack, item);
                            }}
                          >
                            <Volume2 size={13} />
                            <span>Preview</span>
                          </button>

                          {isSelected && (
                            <div className="sceneCard__activeIndicator">
                              <Check size={14} />
                            </div>
                          )}
                          <span className="sceneCard__overlayName">{item.name}</span>
                        </div>

                        <div className="sceneCard__info">
                          <div className="sceneCard__head">
                            <span className="sceneCard__name">{item.name}</span>
                            <span className="sceneCard__engine">{item.specs.engine}</span>
                          </div>
                          <p className="sceneCard__tagline">{item.tagline}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
