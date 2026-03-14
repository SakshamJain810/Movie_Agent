import React, { useState } from 'react';
import { 
  Search, 
  Film, 
  Loader2, 
  X, 
  Maximize,
  ChevronRight
} from 'lucide-react';
import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Movie {
  title: string;
  link: string;
  img: string;
  description: string;
  category: string;
  type?: string;
  extra?: string;
  source?: string;
}

interface MovieDetails {
  title: string;
  poster: string;
  description: string;
  links: { 
    text: string; 
    fileInfo?: string;
    url: string; 
    proxyUrl?: string; 
    streamUrl?: string;
    languages?: string[];
    tracks?: { label: string; url: string; kind: string }[];
    season?: number | null;
    episode?: number | null;
  }[];
}

const API_BASE = '/api';

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('movie');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activeStream, setActiveStream] = useState<string | null>(null);
  const [activeTracks, setActiveTracks] = useState<{ label: string; url: string; kind: string }[]>([]);
  const [currentSeason, setCurrentSeason] = useState<number | 'all' | 'unassigned'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [isTrending, setIsTrending] = useState(true);

  // Fetch Trending/Suggestions on load
  const fetchTrending = async () => {
    setLoading(true);
    setIsTrending(true);
    setQuery('');
    try {
      const resp = await fetch(`${API_BASE}/trending`);
      const data = await resp.json();
      setMovies(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchTrending();
  }, []);

  const handleLogoClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fetchTrending();
  };

  const handleFullscreen = () => {
    if (playerContainerRef.current) {
      if (playerContainerRef.current.requestFullscreen) {
        playerContainerRef.current.requestFullscreen();
      } else if ((playerContainerRef.current as any).webkitRequestFullscreen) {
        (playerContainerRef.current as any).webkitRequestFullscreen();
      } else if ((playerContainerRef.current as any).msRequestFullscreen) {
        (playerContainerRef.current as any).msRequestFullscreen();
      }
    }
  };

  const playNextEpisode = () => {
    if (!selectedMovie || !activeStream) return;
    
    // Find current link index
    const currentIdx = selectedMovie.links.findIndex(l => {
       const urlForExt = l.proxyUrl ? decodeURIComponent(l.proxyUrl.split('url=')[1].split('&')[0]) : l.url;
       return `${API_BASE}/stream?url=${encodeURIComponent(urlForExt)}` === activeStream;
    });

    if (currentIdx !== -1 && currentIdx < selectedMovie.links.length - 1) {
      const nextLink = selectedMovie.links[currentIdx + 1];
      const nextUrl = nextLink.proxyUrl ? decodeURIComponent(nextLink.proxyUrl.split('url=')[1].split('&')[0]) : nextLink.url;
      setActiveStream(`${API_BASE}/stream?url=${encodeURIComponent(nextUrl)}`);
      setActiveTracks(nextLink.tracks || []);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setMovies([]); // Clear previous results
    setIsTrending(false);
    try {
      const resp = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&category=${category}`);
      const data = await resp.json();
      setMovies(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async (movie: Movie) => {
    setDetailsLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/details?url=${encodeURIComponent(movie.link)}&category=${movie.category}`);
      const data = await resp.json();
      data.poster = movie.img;
      setSelectedMovie(data);

      // Auto-set the first available season
      const seasons = Array.from(new Set(data.links.map((l: any) => l.season).filter((s: any) => s !== null))) as number[];
      if (seasons.length > 0) {
        setCurrentSeason(seasons.sort((a, b) => a - b)[0]);
      } else {
        setCurrentSeason('all');
      }
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header / Hero */}
      <header className="header">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="brand"
          onClick={handleLogoClick}
          style={{ cursor: 'pointer' }}
        >
          <div className="brand-icon">
            <Film className="icon" />
          </div>
          <h1 className="brand-title">
            MovieAgent
          </h1>
        </motion.div>
        
        <p className="brand-subtitle">
          Deep search movies, cartoons & anime. Premium access, all languages, no ads.
        </p>

        <div className="category-tabs">
          {['movie', 'anime', 'cartoon', 'tvshow'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`category-tab ${category === cat ? 'active' : ''}`}
            >
              {cat === 'tvshow' ? 'TV Shows' : cat.charAt(0).toUpperCase() + cat.slice(1) + (cat === 'anime' ? '' : 's')}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="search-container">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search for ${category}s...`}
            className="search-input"
          />
          <Search className="search-icon" />
          <button 
            type="submit"
            className="search-button"
          >
            {loading ? <Loader2 className="spinner" /> : 'Search'}
          </button>
        </form>
      </header>


      {/* Main Content */}
      <main className="main-content">
        {isTrending && movies.length > 0 && (
          <div className="section-header">
            <h2 className="section-title">✨ Recommended for You</h2>
          </div>
        )}

        <div className="movie-grid">
          <AnimatePresence mode="popLayout">
            {movies.map((movie, idx) => (
              <motion.div
                key={`${movie.link}-${idx}`}
                layout
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                whileHover={{ y: -8, scale: 1.02 }}
                onClick={() => fetchDetails(movie)}
                className="movie-card"
              >
                <div className="card-media">
                  <img 
                    src={movie.img} 
                    alt={movie.title}
                    className="card-image"
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x450?text=No+Poster' }}
                  />
                  <div className="card-overlay">
                    <button className="overlay-btn">
                      View Details
                    </button>
                  </div>
                  <div className="card-badges">
                    {movie.type && (
                      <span className="badge-type">{movie.type}</span>
                    )}
                    {movie.source && (
                      <span className={`badge-source badge-source-${movie.source.toLowerCase()}`}>
                        {movie.source}
                      </span>
                    )}
                  </div>
                </div>
                <div className="card-info">
                  <h3 className="card-title" title={movie.title}>
                    {movie.title}
                  </h3>
                  {movie.extra && <span className="card-extra">{movie.extra}</span>}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {loading && (
          <div className="loading-state">
            <Loader2 className="spinner large" />
            <p>Gathering the best content for you...</p>
          </div>
        )}

        {movies.length === 0 && !loading && (
          <div className="empty-state">
            <Film className="empty-icon" />
            <p>No results found. Try an alternative mirror or check your spelling.</p>
          </div>
        )}
      </main>


      <AnimatePresence>
        {(detailsLoading || selectedMovie) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="modal-content"
            >
              <button 
                onClick={() => {
                  setSelectedMovie(null);
                  setActiveStream(null);
                  setCurrentSeason('all');
                  setVideoError(false);
                }}
                className="modal-close"
              >
                <X className="icon" />
              </button>

              {detailsLoading ? (
                <div className="modal-loading">
                    <Loader2 className="spinner large" />
                    <p>Extracting links...</p>
                </div>
              ) : selectedMovie && (
                <div className="modal-body">
                  {activeStream ? (
                    <div ref={playerContainerRef} className="video-player-container">
                      <div className="player-header">
                        <button 
                          onClick={() => {
                            setActiveStream(null);
                            setActiveTracks([]);
                            setVideoError(false);
                          }}
                          className="back-btn"
                        >
                          ← Back
                        </button>
                        <h3 className="player-title">{selectedMovie.title}</h3>
                        
                        <div className="player-actions">
                          {/* Language Selector in Player */}
                          {selectedMovie.links.length > 1 && (
                            <div className="player-lang-selector">
                              <select 
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val) {
                                    const link = selectedMovie.links.find(l => l.url === val);
                                    if (link) {
                                        const urlForExt = link.proxyUrl ? decodeURIComponent(link.proxyUrl.split('url=')[1].split('&')[0]) : link.url;
                                        setVideoError(false);
                                        setActiveStream(`${API_BASE}/stream?url=${encodeURIComponent(urlForExt)}`);
                                        setActiveTracks(link.tracks || []);
                                    }
                                  }
                                }}
                                className="lang-dropdown"
                                value={selectedMovie.links.find(l => {
                                   const urlForExt = l.proxyUrl ? decodeURIComponent(l.proxyUrl.split('url=')[1].split('&')[0]) : l.url;
                                   return `${API_BASE}/stream?url=${encodeURIComponent(urlForExt)}` === activeStream;
                                })?.url || ''}
                              >
                                {selectedMovie.links.map((l, idx) => (
                                  <option key={idx} value={l.url}>
                                    Language: {(l.languages || ['Original']).join(', ')}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <button 
                            onClick={playNextEpisode}
                            className="player-control-btn play-next-btn"
                            title="Next Episode"
                            disabled={!selectedMovie || selectedMovie.links.findIndex(l => {
                               const urlForExt = l.proxyUrl ? decodeURIComponent(l.proxyUrl.split('url=')[1].split('&')[0]) : l.url;
                               return `${API_BASE}/stream?url=${encodeURIComponent(urlForExt)}` === activeStream;
                            }) === selectedMovie.links.length - 1}
                          >
                            <span>Next</span>
                            <ChevronRight className="icon-xs" />
                          </button>

                          <button 
                            onClick={handleFullscreen}
                            className="player-control-btn"
                            title="Fullscreen"
                          >
                            <Maximize className="icon-xs" />
                            <span>Fullscreen</span>
                          </button>
                        </div>
                      </div>
                      <video 
                        ref={videoRef}
                        key={activeStream} // Re-mount video on source change
                        src={activeStream} 
                        controls 
                        autoPlay
                        className="main-video-player"
                        crossOrigin="anonymous"
                        onEnded={playNextEpisode}
                        onPlay={() => setVideoError(false)}
                        onError={() => {
                          console.error("Video Playback Error");
                          setVideoError(true);
                        }}
                      >
                        {activeTracks.map((track, tidx) => (
                          <track 
                            key={tidx}
                            label={track.label}
                            kind={track.kind as any}
                            src={`${API_BASE}/stream?url=${encodeURIComponent(track.url)}`}
                            srcLang="en"
                          />
                        ))}
                      </video>
                      
                      {videoError && (
                         <div className="player-error-overlay">
                            <div className="error-card">
                               <div className="error-icon-box">
                                  <X className="error-icon" />
                               </div>
                               <h3>Format Not Supported</h3>
                               <p>Your browser (Chrome/Edge/Safari) cannot play this format (likely .MKV or .AVI) directly.</p>
                               
                               <div className="error-actions">
                                 {(() => {
                                      const currentLink = selectedMovie.links.find(l => {
                                        const urlForExt = l.proxyUrl ? decodeURIComponent(l.proxyUrl.split('url=')[1].split('&')[0]) : l.url;
                                        return `${API_BASE}/stream?url=${encodeURIComponent(urlForExt)}` === activeStream;
                                      });
                                      if (!currentLink) return null;
                                      
                                      const urlForExt = currentLink.proxyUrl ? decodeURIComponent(currentLink.proxyUrl.split('url=')[1].split('&')[0]) : currentLink.url;
                                      const extension = urlForExt.split('.').pop()?.toLowerCase() || 'mp4';
                                      const cleanExt = ['mp4', 'mkv', 'mp3', 'avi'].includes(extension) ? extension : 'mp4';
                                      const suggestedName = `${selectedMovie.title.replace(/[^a-z0-9]/gi, '_')}.${cleanExt}`;

                                      return (
                                        <>
                                          <a 
                                            href={`${API_BASE}/download?url=${encodeURIComponent(urlForExt)}&name=${encodeURIComponent(suggestedName)}`}
                                            className="error-btn download-btn"
                                          >
                                            Download Now
                                          </a>
                                          <a 
                                            href={`vlc://${urlForExt}`}
                                            className="error-btn vlc-btn"
                                          >
                                            Play in VLC
                                          </a>
                                          <button 
                                            onClick={() => {
                                              setActiveStream(null);
                                              setVideoError(false);
                                            }}
                                            className="error-btn cancel-btn"
                                          >
                                            Dismiss & Go Back
                                          </button>
                                        </>
                                      );
                                 })()}
                               </div>
                            </div>
                         </div>
                      )}

                      <div className="player-footer">
                        <p>Streaming from secure proxy. Seeking enabled.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="modal-sidebar">
                        <img 
                          src={selectedMovie.poster} 
                          alt={selectedMovie.title}
                          className="modal-poster"
                        />
                      </div>
                      <div className="modal-main">
                        <h2 className="modal-title">{selectedMovie.title}</h2>
                        <p className="modal-desc">
                          {selectedMovie.description}
                        </p>

                        <div className="links-section">
                          <div className="links-section-header">
                            <h4 className="links-label">EPISODE SELECTION</h4>
                          <div className="mirror-links">
                            <a 
                              href={`https://bollyflix.sarl/?s=${encodeURIComponent(selectedMovie.title)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mirror-btn bolly"
                            >
                              Bollyflix Mirror
                            </a>
                            <a 
                              href={`https://netmirr.net/search?q=${encodeURIComponent(selectedMovie.title)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mirror-btn net"
                            >
                              NetMirror
                            </a>
                            <a 
                              href={`https://archive.org/search?query=${encodeURIComponent(selectedMovie.title)}&mediatype=movies`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mirror-btn archive"
                            >
                              Archive.org
                            </a>
                          </div>
                          </div>
                          
                          {/* Season Switcher */}
                          {(() => {
                            const seasons = Array.from(new Set(selectedMovie.links.map(l => l.season).filter(s => s !== null))) as number[];
                            const hasSeasons = seasons.length > 0;
                            
                            if (!hasSeasons) return null;

                            return (
                              <div className="season-tabs">
                                <button 
                                  onClick={() => {
                                    setCurrentSeason('all');
                                    setCurrentPage(1);
                                  }}
                                  className={`season-tab ${currentSeason === 'all' ? 'active' : ''}`}
                                >
                                  All
                                </button>
                                {seasons.sort((a, b) => a - b).map(s => (
                                  <button 
                                    key={s}
                                    onClick={() => {
                                      setCurrentSeason(s);
                                      setCurrentPage(1);
                                    }}
                                    className={`season-tab ${currentSeason === s ? 'active' : ''}`}
                                  >
                                    Season {s}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}

                          <div className="links-list">
                            {(() => {
                              const filteredLinks = selectedMovie.links
                                .filter(link => {
                                  if (currentSeason === 'all') return true;
                                  return link.season === currentSeason;
                                })
                                .sort((a, b) => {
                                  const aIsHindi = a.languages?.some(l => l.toLowerCase().includes('hindi'));
                                  const bIsHindi = b.languages?.some(l => l.toLowerCase().includes('hindi'));
                                  if (aIsHindi && !bIsHindi) return -1;
                                  if (!aIsHindi && bIsHindi) return 1;
                                  return (a.episode || 0) - (b.episode || 0);
                                });
                              
                              const itemsPerPage = 5;
                              const totalPages = Math.ceil(filteredLinks.length / itemsPerPage);
                              const paginatedLinks = filteredLinks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

                              return (
                                <>
                                  {paginatedLinks.map((link, i) => {
                                    const realIndex = (currentPage - 1) * itemsPerPage + i;
                                    const urlForExt = link.proxyUrl ? decodeURIComponent(link.proxyUrl.split('url=')[1].split('&')[0]) : link.url;
                                    const extension = urlForExt.split('.').pop()?.toLowerCase() || '';
                                    const cleanExt = ['mp4', 'mkv', 'mp3', 'avi'].includes(extension) ? extension : 'mp4';
                                    const suggestedName = `${selectedMovie.title.replace(/[^a-z0-9]/gi, '_')}.${cleanExt}`;
                                    const isSelected = activeStream === `${API_BASE}/stream?url=${encodeURIComponent(urlForExt)}`;

                                    // Only show Download for direct media files — no shorteners/redirects
                                    const SHORTENER_HOSTS = ['dizztips', 'finzoox', 'hubcloud', 'shrinkme', 'gplinks', 'ouo.io', 'short.pe', 'mdisk.me', 'bit.ly', 'blog.'];
                                    const isDirectFile = ['mp4', 'mkv', 'avi', 'mp3', 'mov'].includes(extension);
                                    const isShortener = SHORTENER_HOSTS.some(h => urlForExt.includes(h));
                                    const canDirectDownload = isDirectFile && !isShortener;

                                    return (
                                      <div key={realIndex} className="link-wrapper">
                                        <div className="link-item">
                                          <div className="link-number">{realIndex + 1}.</div>
                                          <div className="link-info">
                                            <div className="link-header-row">
                                              <span className="link-text">{link.text}</span>
                                              <span className="file-info-badge">{link.fileInfo}</span>
                                              {link.season && <span className="ep-badge">S{link.season}</span>}
                                              {link.episode && <span className="ep-badge">E{link.episode}</span>}
                                            </div>
                                            <div className="language-tags">
                                              {(link.languages || ['Original']).map((lang: string, idx: number) => (
                                                <span key={idx} className={`lang-tag ${lang.toLowerCase() === 'hindi' ? 'lang-hindi' : ''}`}>
                                                  {lang}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                          <div className="link-actions">
                                            <button 
                                              onClick={() => {
                                                setVideoError(false);
                                                setActiveStream(`${API_BASE}/stream?url=${encodeURIComponent(urlForExt)}`);
                                                setActiveTracks(link.tracks || []);
                                              }}
                                              className={`action-btn watch-btn ${isSelected ? 'active' : ''}`}
                                            >
                                              {isSelected ? 'Playing' : 'Watch'}
                                            </button>
                                            {canDirectDownload && (
                                              <a 
                                                href={`${API_BASE}/download?url=${encodeURIComponent(urlForExt)}&name=${encodeURIComponent(suggestedName)}`}
                                                className="action-btn dl-btn"
                                              >
                                                Download
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {totalPages > 1 && (
                                    <div className="pagination">
                                      <button 
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => prev - 1)}
                                        className="pag-btn"
                                      >
                                        Prev
                                      </button>
                                      {[...Array(totalPages)].map((_, i) => {
                                        const p = i + 1;
                                        if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
                                          return (
                                            <button 
                                              key={p}
                                              onClick={() => setCurrentPage(p)}
                                              className={`pag-btn ${currentPage === p ? 'active' : ''}`}
                                            >
                                              {p}
                                            </button>
                                          );
                                        }
                                        if (p === currentPage - 2 || p === currentPage + 2) return <span key={p}>...</span>;
                                        return null;
                                      })}
                                      <button 
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(prev => prev + 1)}
                                        className="pag-btn"
                                      >
                                        Next
                                      </button>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="footer">
        <p>© 2026 MovieAgent - For Educational Purposes Only</p>
      </footer>

    </div>
  );
};

export default App;
