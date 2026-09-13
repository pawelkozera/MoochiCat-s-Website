import titleArtwork from '../assets/community-title.png'
import './CommunityTitle.css'

export function CommunityTitle() {
  return (
    <h1 className="community-title" aria-label="Community events">
      <svg viewBox="25 442 2015 637" aria-hidden="true" focusable="false">
        <image href={titleArtwork} width="2048" height="1535" />
      </svg>
    </h1>
  )
}
