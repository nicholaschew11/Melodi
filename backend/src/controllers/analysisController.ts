import { Request, Response } from "express";
import { getDatabase } from "../db";

interface SongData {
    id: string;
    href: string;
    acousticness: number;
    danceability: number;
    energy: number;
    instrumentalness: number;
    key: number;
    liveness: number;
    loudness: number;
    mode: number;
    speechiness: number;
    tempo: number;
    valence: number;
}

interface SongDataResponse {
    content: SongData[];
}

// Helper function to fetch song data from the database by songId
const getSongById = async (songId: string) => {
    const supabase = await getDatabase();

    // Query the song_data table for the given songId
    const { data: song, error } = await supabase
        .from("song_data")
        .select("*")
        .eq("id", songId)
        .single();

    // If no song is found, return null instead of throwing
    if (error && error.code === "PGRST116") {
        return null;
    }
    if (error) {
        console.error("Error getting song from song_data:", error);
        throw error;
    }
    return song;
};

/**
 * Creates a song analysis entry in the database.
 * - Checks if analysis already exists for the song.
 * - If not, fetches Spotify ID from songs table.
 * - Calls ReccoBeats API for audio features.
 * - Inserts the features into song_data table.
 * - Responds with the created or existing song analysis.
 */
export const createSongAnalysis = async (req: Request, res: Response) => {
    const { songId } = req.params;
    try {
        // Check if song analysis already exists
        const existingSong = await getSongById(songId);
        if (existingSong) {
            // If exists, return it
            return res.status(200).json(existingSong);
        }
        const supabase = await getDatabase();

        // Get Spotify ID for the song
        const { data: spotify_id, error } = await supabase
            .from("songs")
            .select("spotify_id")
            .eq("song_id", songId)
            .single();

        // Handle missing songId or query error
        if (error || !spotify_id) {
            console.log(
                "Song not found or error getting spotify id from songs",
                error,
            );
            return res.status(404).json({ error: "Song not found" });
        }

        // Fetch audio features from ReccoBeats API
        const RECCO_BEATS_URL = `https://api.reccobeats.com/v1/audio-features?ids=${spotify_id.spotify_id}`;
        console.log(RECCO_BEATS_URL);
        const response = await fetch(RECCO_BEATS_URL, {
            method: "GET",
        });

        // Handle API errors
        if (!response.ok) {
            console.error("Network response was not ok:", response.statusText);
            return res.status(502).json({ error: response.statusText });
        }
        const data = (await response.json()) as SongDataResponse;
        const songData = data.content[0];
        if (!songData) {
            return res
                .status(404)
                .json({ error: "Song data not found on Reccobeats" });
        }

        // Insert the audio features into song_data table
        const { data: newSong, error: createError } = await supabase
            .from("song_data")
            .insert([
                {
                    id: songId,
                    acousticness: songData.acousticness,
                    danceability: songData.danceability,
                    energy: songData.energy,
                    instrumentalness: songData.instrumentalness,
                    key: songData.key,
                    liveness: songData.liveness,
                    loudness: songData.loudness,
                    mode: songData.mode,
                    speechiness: songData.speechiness,
                    tempo: songData.tempo,
                    valence: songData.valence,
                },
            ])
            .select()
            .single();

        if (createError) {
            console.log(
                "Error creating new song data into song_data",
                createError,
            );
            return res
                .status(500)
                .json({ error: "Error creating new song data" });
        }
        return res.status(201).json(newSong);
    } catch (err) {
        console.error("Unexpected error in createSongAnalysis:", err);
        return res.status(500).json({ error: "Unexpected error" });
    }
};

export const getSong = async (req: Request, res: Response) => {
    const { songId } = req.params;
    try {
        const song = await getSongById(songId);
        if (!song) {
            return res.status(404).json({ error: "Song not found" });
        }
        return res.status(200).json(song);
    } catch (err) {
        console.error("Error in getSong:", err);
        return res.status(500).json({ error: "Unexpected error" });
    }
};

export const getAnalysisFor = async (req: Request, res: Response) => {
    const { start, end } = req.query;

    // Validate query parameters
    if (!start || !end) {
        return res
            .status(400)
            .json({ error: "Missing start or end query parameter" });
    }

    const startNum = parseInt(start as string, 10);
    const endNum = parseInt(end as string, 10);

    if (isNaN(startNum) || isNaN(endNum)) {
        return res
            .status(400)
            .json({ error: "Start and end must be valid numbers" });
    }

    const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const promises = [];
    for (let i = startNum; i <= endNum; i++) {
        promises.push(
            fetch(`${apiBaseUrl}/api/analysis/song/${i}`, {
                method: "POST",
            }),
        );
    }

    Promise.all(promises).catch((err) => {
        console.error("Error in batch analysis trigger:", err);
    });

    res.status(200).json({
        message: "Triggered createSongAnalysis",
    });
};

/**
 * Endpoint for mood analysis.
 * Expects a JSON body: { songIds: [id1, id2, ...] }
 * Returns all song_data rows matching those IDs.
 */
function classifyMood(energy: number, valence: number): string {
    if (energy > 0 && valence > 0) return "excited";
    if (energy <= 0 && valence > 0) return "sombre";
    if (energy <= 0 && valence <= 0) return "depressed";
    if (energy > 0 && valence <= 0) return "frustration";
    return "unknown";
}

export const moodAnalysis = async (req: Request, res: Response) => {
    const { songIds } = req.body;

    if (!Array.isArray(songIds) || songIds.length === 0) {
        return res
            .status(400)
            .json({ error: "songIds must be a non-empty array" });
    }

    try {
        const supabase = await getDatabase();
        const { data, error } = await supabase
            .from("song_data")
            .select("energy, valence")
            .in("id", songIds);

        if (error) {
            console.error("Error fetching mood analysis data:", error);
            return res
                .status(500)
                .json({ error: "Error fetching mood analysis data" });
        }

        if (!data || data.length === 0) {
            return res
                .status(404)
                .json({ error: "No songs found for provided IDs" });
        }

        // Calculate averages in JS
        const total = data.reduce(
            (acc, row) => {
                acc.energy += row.energy ?? 0;
                acc.valence += row.valence ?? 0;
                return acc;
            },
            { energy: 0, valence: 0 },
        );

        const count = data.length;
        const avgEnergy = total.energy / count;
        const avgValence = total.valence / count;

        // Convert from 0-1 to -1 to 1
        const scaledEnergy = avgEnergy * 2 - 1;
        const scaledValence = avgValence * 2 - 1;

        // Classify mood
        const mood = classifyMood(scaledEnergy, scaledValence);

        return res.status(200).json({
            average: {
                energy: scaledEnergy,
                valence: scaledValence,
            },
            mood,
            count,
        });
    } catch (err) {
        console.error("Unexpected error in moodAnalysis:", err);
        return res.status(500).json({ error: "Unexpected error" });
    }
};
