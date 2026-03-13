
import React, { useState } from 'react';
import { Search, Film, ExternalLink, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Movie {
  title: string;
  link: string;
  img: string;
}

interface MovieDetails {
  title: string;
  poster: string;
  description: string;
  links: { text: string; url: string }[];
}

const API_BASE = 'http://localhost:3001/api';

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
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
      const resp = await fetch(`${API_BASE}/details?url=${encodeURIComponent(movie.link)}`);
      const data = await resp.json();
      data.poster = movie.img;
      setSelectedMovie(data);
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
        >
          <div className="brand-icon">
            <Film className="icon" />
          </div>
          <h1 className="brand-title">
            MovieAgent
          </h1>
        </motion.div>
        
        <p className="brand-subtitle">
          Deep search movie download links across the web. Premium access, no ads, just links.
        </p>

        <form onSubmit={handleSearch} className="search-container">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for movies or TV shows..."
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
        <div className="movie-grid">
          <AnimatePresence>
            {movies.map((movie, idx) => (
              <motion.div
                key={idx}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -8 }}
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
                </div>
                <div className="card-info">
                  <h3 className="card-title">
                    {movie.title}
                  </h3>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {movies.length === 0 && !loading && (
          <div className="empty-state">
            <Film className="empty-icon" />
            <p>Start by searching for your favorite movie</p>
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
                onClick={() => setSelectedMovie(null)}
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
                      <h4 className="links-label">DOWNLOAD LINKS</h4>
                      <div className="links-list">
                        {selectedMovie.links.map((link, i) => (
                          <a 
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-item"
                          >
                            <span className="link-text">{link.text}</span>
                            <div className="link-meta">
                              <span className="link-hint">Direct Link</span>
                              <ExternalLink className="icon-xs" />
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
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
