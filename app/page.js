'use client';

import { useEffect, useState } from 'react';
import styles from './page.module.css';

const searchFilterLabels = {
  trackName: 'Track name',
  artistName: 'Artist name',
  albumName: 'Album name',
  albumYear: 'Album year',
};

const formatDuration = (durationMs) => {
  if (!durationMs) {
    return '0:00';
  }

  const minutes = Math.floor(durationMs / 60000);
  const seconds = String(Math.floor((durationMs % 60000) / 1000)).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const getPlaylistDescription = (playlist) => {
  const description = playlist.description?.trim();

  if (!description || description.toLowerCase() === 'null') {
    return '';
  }

  return description;
};

const getPlaylistSubtitle = (playlist) => {
  const privacyLabel = playlist.public ? 'Public playlist' : 'Private playlist';
  return `${playlist.tracks.total} tracks • ${privacyLabel}`;
};

export default function Home() {
  const [accessToken, setAccessToken] = useState('');
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const [searchFilters, setSearchFilters] = useState({
    trackName: true,
    artistName: true,
    albumName: true,
    albumYear: true,
  });

  const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const REDIRECT_URI = process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://127.0.0.1:3000';
  const SCOPES = 'playlist-read-private playlist-read-collaborative';

  const generateCodeVerifier = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const generateCodeChallenge = async (verifier) => {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
      console.error('Spotify auth error:', error);
      setStatusMessage(`Authentication failed: ${error}`);
      return;
    }

    if (code) {
      exchangeCodeForToken(code);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      fetchPlaylists();
    }
  }, [accessToken]);

  useEffect(() => {
    if (searchTerm && tracks.length > 0) {
      const filtered = tracks.filter((item) => {
        if (!item.track) {
          return false;
        }

        const searchLower = searchTerm.toLowerCase();
        let matches = false;

        if (searchFilters.trackName && item.track.name.toLowerCase().includes(searchLower)) {
          matches = true;
        }

        if (
          searchFilters.artistName &&
          item.track.artists.some((artist) => artist.name.toLowerCase().includes(searchLower))
        ) {
          matches = true;
        }

        if (searchFilters.albumName && item.track.album.name.toLowerCase().includes(searchLower)) {
          matches = true;
        }

        if (searchFilters.albumYear && item.track.album.release_date) {
          const year = item.track.album.release_date.substring(0, 4);
          if (year.includes(searchTerm)) {
            matches = true;
          }
        }

        return matches;
      });

      setFilteredTracks(filtered);
    } else {
      setFilteredTracks(tracks);
    }
  }, [searchTerm, tracks, searchFilters]);

  const handleLogin = async () => {
    if (!CLIENT_ID) {
      setStatusMessage('Missing NEXT_PUBLIC_SPOTIFY_CLIENT_ID. Add it to your environment to continue.');
      return;
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    sessionStorage.setItem('code_verifier', codeVerifier);

    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&response_type=code&code_challenge_method=S256&code_challenge=${codeChallenge}&show_dialog=true`;
    window.location.href = authUrl;
  };

  const exchangeCodeForToken = async (code) => {
    const codeVerifier = sessionStorage.getItem('code_verifier');

    if (!codeVerifier) {
      console.error('Code verifier not found');
      setStatusMessage('Your session expired before Spotify finished signing you in. Please try again.');
      return;
    }

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          code_verifier: codeVerifier,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAccessToken(data.access_token);
        setStatusMessage('');
        sessionStorage.removeItem('code_verifier');
      } else {
        console.error('Token exchange failed:', await response.text());
        setStatusMessage('Spotify sign-in could not be completed. Please try again.');
      }
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      setStatusMessage('Network error while signing in to Spotify. Please try again.');
    }
  };

  const fetchPlaylists = async () => {
    setLoading(true);
    setStatusMessage('');

    try {
      const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPlaylists(data.items || []);
      } else {
        console.error('Failed to fetch playlists');
        setStatusMessage('We could not load your playlists. Please sign in again.');
      }
    } catch (error) {
      console.error('Error fetching playlists:', error);
      setStatusMessage('Network error while loading playlists.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlaylistTracks = async (playlistId) => {
    setLoading(true);
    setTracks([]);
    setFilteredTracks([]);
    setStatusMessage('');

    try {
      let allTracks = [];
      let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`;

      while (nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          allTracks = [...allTracks, ...(data.items || [])];
          nextUrl = data.next;
        } else {
          console.error('Failed to fetch playlist tracks');
          setStatusMessage('We could not load tracks for that playlist.');
          break;
        }
      }

      setTracks(allTracks);
      setFilteredTracks(allTracks);
    } catch (error) {
      console.error('Error fetching playlist tracks:', error);
      setStatusMessage('Network error while loading tracks.');
    } finally {
      setLoading(false);
    }
  };

  const handlePlaylistSelect = (playlist) => {
    setSelectedPlaylist(playlist);
    setSearchTerm('');
    fetchPlaylistTracks(playlist.id);
  };

  const handleBackToPlaylists = () => {
    setSelectedPlaylist(null);
    setTracks([]);
    setFilteredTracks([]);
    setSearchTerm('');
    setStatusMessage('');
  };

  const handleLogout = () => {
    setAccessToken('');
    setPlaylists([]);
    setSelectedPlaylist(null);
    setTracks([]);
    setFilteredTracks([]);
    setSearchTerm('');
    setStatusMessage('');
    sessionStorage.removeItem('code_verifier');
  };

  const handleFilterChange = (filterName) => {
    setSearchFilters((prev) => ({
      ...prev,
      [filterName]: !prev[filterName],
    }));
  };

  const renderStatus = () =>
    statusMessage ? (
      <div className={styles.statusMessage} role="status">
        {statusMessage}
      </div>
    ) : null;

  if (!accessToken) {
    return (
      <main className={styles.pageShell}>
        <section className={`${styles.appCard} ${styles.loginCard}`}>
          <div className={styles.loginLayout}>
            <div className={styles.loginStack}>
              
              <h1 className={styles.sectionTitle}>Spotify Enhanced Search</h1>
              <p className={styles.sectionText}>
                Sign in with Spotify to browse your playlists, filter tracks by song, artist, album, or year,
                and jump straight into playback.
              </p>
              <div className={styles.loginActions}>
                <button className={styles.primaryButton} onClick={handleLogin}>
                  Continue with Spotify
                </button>
                
              </div>
              {renderStatus()}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!selectedPlaylist) {
    return (
      <main className={styles.pageShell}>
        <section className={styles.appCard}>
          <header className={styles.topBar}>
            <div>
              <span className={styles.eyebrow}>Your library</span>
              <h1 className={styles.sectionTitle}>Choose a playlist to search</h1>
              <p className={styles.sectionText}>Pick any playlist below and we&apos;ll load every track for search.</p>
            </div>
            <button className={styles.secondaryButton} onClick={handleLogout}>
              Log out
            </button>
          </header>

          {renderStatus()}

          {loading ? (
            <div className={styles.emptyState}>
              <div className={styles.spinner} aria-hidden="true" />
              <p>Loading playlists...</p>
            </div>
          ) : (
            <div className={styles.playlistGrid}>
              {playlists.map((playlist) => {
                const image = playlist.images?.[0]?.url;

                return (
                  <button
                    key={playlist.id}
                    type="button"
                    className={styles.playlistCard}
                    onClick={() => handlePlaylistSelect(playlist)}
                  >
                    <div className={styles.playlistArtwork}>
                      {image ? (
                        <img src={image} alt="" className={styles.playlistImage} />
                      ) : (
                        <div className={styles.artworkFallback}>♪</div>
                      )}
                    </div>
                    <div className={styles.playlistContent}>
                      <h2 className={styles.playlistTitle}>{playlist.name}</h2>
                      <p className={styles.playlistMeta}>{getPlaylistSubtitle(playlist)}</p>
                      <p className={styles.playlistDescription}>
                        {getPlaylistDescription(playlist)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.pageShell}>
      <section className={styles.appCard}>
        <header className={styles.topBar}>
          <div>
            <div className={styles.breadcrumbRow}>
              <button className={styles.ghostButton} onClick={handleBackToPlaylists}>
                ← Back to playlists
              </button>
              <span className={styles.badge}>Playlist search</span>
            </div>
            <h1 className={styles.sectionTitle}>{selectedPlaylist.name}</h1>
            <p className={styles.sectionText}>Filter by title, artist, album, or release year.</p>
          </div>
          <button className={styles.secondaryButton} onClick={handleLogout}>
            Log out
          </button>
        </header>

        <section className={styles.searchPanel}>
          <label className={styles.searchLabel} htmlFor="track-search">
            Search tracks
          </label>
          <input
            id="track-search"
            type="text"
            className={styles.searchInput}
            placeholder="Try a song title, artist, album, or year"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          <div className={styles.filterRow}>
            {Object.entries(searchFilters).map(([key, value]) => (
              <label key={key} className={styles.filterChip}>
                <input
                  type="checkbox"
                  checked={value}
                  onChange={() => handleFilterChange(key)}
                />
                <span>{searchFilterLabels[key]}</span>
              </label>
            ))}
          </div>
        </section>

        {renderStatus()}

        {loading ? (
          <div className={styles.emptyState}>
            <div className={styles.spinner} aria-hidden="true" />
            <p>Loading tracks...</p>
          </div>
        ) : (
          <>
            <div className={styles.resultsHeader}>
              <p className={styles.resultsCount}>
                Showing <strong>{filteredTracks.length}</strong> of <strong>{tracks.length}</strong> tracks
              </p>
            </div>

            {filteredTracks.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No tracks match that search yet.</p>
                <p className={styles.helperText}>Try fewer keywords or enable more search fields above.</p>
              </div>
            ) : (
              <div className={styles.trackList}>
                {filteredTracks.map((item, index) => {
                  const track = item.track;

                  if (!track) {
                    return null;
                  }

                  const albumImage = track.album.images?.[2]?.url || track.album.images?.[0]?.url;

                  return (
                    <article key={`${track.id || track.name}-${index}`} className={styles.trackCard}>
                      <div className={styles.trackMain}>
                        <div className={styles.trackArtwork}>
                          {albumImage ? (
                            <img src={albumImage} alt="" className={styles.trackImage} />
                          ) : (
                            <div className={styles.artworkFallback}>♫</div>
                          )}
                        </div>

                        <div className={styles.trackCopy}>
                          <h2 className={styles.trackTitle}>{track.name}</h2>
                          <p className={styles.trackMeta}>{track.artists.map((artist) => artist.name).join(', ')}</p>
                          <p className={styles.trackAlbum}>
                            {track.album.name}
                            {track.album.release_date ? ` • ${track.album.release_date.substring(0, 4)}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className={styles.trackActions}>
                        <span className={styles.durationPill}>{formatDuration(track.duration_ms)}</span>
                        <a
                          href={track.external_urls.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.primaryLink}
                        >
                          Open in Spotify
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
