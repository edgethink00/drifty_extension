/**
 * Subcategory definitions for detailed classification
 * Matches server-side subcategories.py
 */

export const SUBCATEGORIES = {
  social: {
    messaging: "Direct messaging, chat apps",
    social_media: "Social media feeds",
    forums: "Forum discussions, Q&A",
    general: "General social interaction"
  },

  entertainment: {
    video: "Video streaming, movies, TV shows",
    podcast: "Podcasts, audio content",
    general: "General entertainment"
  },

  music: {
    general: "Music streaming and listening"
  },

  productivity: {
    email: "Email clients and services",
    documents: "Document editing, spreadsheets",
    tools: "Work tools, project management",
    ai_tools: "AI assistants",
    general: "General productivity tools"
  },

  learning: {
    courses: "Online courses, MOOCs",
    documentation: "Technical docs, API references",
    tutorials: "How-to guides, tutorials",
    general: "General learning content"
  },

  shopping: {
    general: "All shopping activities"
  },

  news: {
    general: "All news content"
  },

  games: {
    general: "All gaming activities"
  },

  adult: {
    general: "Adult content"
  },

  other: {
    general: "Uncategorized content"
  }
};

/**
 * Get subcategories for a category
 */
export function getSubcategories(category) {
  return SUBCATEGORIES[category] || { general: "General content" };
}

/**
 * Get subcategory display name
 */
export function getSubcategoryName(subcategory) {
  const names = {
    messaging: "Messaging",
    social_media: "Social Media",
    forums: "Forums",
    video: "Video",
    podcast: "Podcast",
    email: "Email",
    documents: "Documents",
    tools: "Tools",
    ai_tools: "AI Tools",
    courses: "Courses",
    documentation: "Documentation",
    tutorials: "Tutorials",
    general: "General"
  };
  return names[subcategory] || subcategory;
}

/**
 * Check if category has multiple subcategories
 */
export function hasMultipleSubcategories(category) {
  const subcats = SUBCATEGORIES[category] || {};
  return Object.keys(subcats).length > 1;
}
