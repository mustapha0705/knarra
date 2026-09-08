import gameDetail from './media/boardmates-game-detail.png'
import gameDetailAlt from './media/boardmates-game-detail-alt.png'
import feed from './media/boardmates-feed.png'
import submitGame from './media/boardmates-submit-game.png'

/**
 * The four screenshots the design export actually references. They stand in
 * for a user's imported media: the workspace uses them for card thumbnails,
 * and the editor offers them through "Add from workspace".
 */
export const WORKSPACE_MEDIA = [
  { name: 'boardmates-game-detail.png', src: gameDetail },
  { name: 'boardmates-game-detail-alt.png', src: gameDetailAlt },
  { name: 'boardmates-feed.png', src: feed },
  { name: 'boardmates-submit-game.png', src: submitGame },
] as const

export const THUMBS = {
  gameDetail,
  gameDetailAlt,
  feed,
  submitGame,
}
