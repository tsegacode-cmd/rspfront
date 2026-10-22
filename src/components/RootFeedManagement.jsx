import { useCallback, useEffect, useState } from 'react'
import { socialAPI } from '../services/api'
import Pagination, { getPageItems, PAGE_SIZE } from './Pagination'
import './RootFeedManagement.css'

const formatDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}

const describePost = post => post.content || post.product_name || 'Post has no text.'

function RootFeedManagement() {
  const [data, setData] = useState({ posts: [], reports: [], stories: [] })
  const [view, setView] = useState('reports')
  const [loading, setLoading] = useState(true)
  const [storiesLoading, setStoriesLoading] = useState(false)
  const [storiesLoaded, setStoriesLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [actions, setActions] = useState({})
  const [reviewReasons, setReviewReasons] = useState({})
  const [storyReasons, setStoryReasons] = useState({})
  const [reportsPage, setReportsPage] = useState(0)
  const [postsPage, setPostsPage] = useState(0)
  const [storiesPage, setStoriesPage] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await socialAPI.getRootFeedModeration()
      setData(current => ({ ...current, ...response.data }))
    } catch (loadError) {
      setError(loadError.message || 'Could not load feed moderation data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadStories = useCallback(async () => {
    setStoriesLoading(true)
    setError('')
    try {
      const response = await socialAPI.getRootStories()
      setData(current => ({ ...current, stories: response.data }))
      setStoriesLoaded(true)
    } catch (loadError) {
      setError(loadError.message || 'Could not load active stories.')
    } finally {
      setStoriesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'stories' && !storiesLoaded) loadStories()
  }, [view, storiesLoaded, loadStories])

  const moderate = async post => {
    const draft = actions[post.post_id] || {}
    const action = draft.action || (post.moderation_status === 'hidden' ? 'restore' : 'hide')
    const reason = (draft.reason || '').trim()
    if (!reason) {
      setError('Enter a reason before applying a moderation action.')
      return
    }
    setBusyId(post.post_id)
    setError('')
    try {
      await socialAPI.moderateRootPost(post.post_id, action, reason)
      setActions(current => ({ ...current, [post.post_id]: { ...current[post.post_id], reason: '' } }))
      await load()
    } catch (moderationError) {
      setError(moderationError.message || 'Could not apply this moderation action.')
    } finally {
      setBusyId('')
    }
  }

  const reviewReport = async report => {
    const reason = (reviewReasons[report.report_id] || '').trim()
    if (!reason) {
      setError('Enter a review reason before closing a report.')
      return
    }
    setBusyId(report.report_id)
    setError('')
    try {
      await socialAPI.reviewRootPostReport(report.report_id, 'dismissed', reason)
      setReviewReasons(current => ({ ...current, [report.report_id]: '' }))
      await load()
    } catch (reviewError) {
      setError(reviewError.message || 'Could not update this report.')
    } finally {
      setBusyId('')
    }
  }

  const removeStory = async story => {
    const reason = (storyReasons[story.story_id] || '').trim()
    if (!reason) {
      setError('Enter a reason before removing a story.')
      return
    }
    if (!window.confirm(`Remove this story from @${story.username}? This cannot be undone.`)) return
    setBusyId(story.story_id)
    setError('')
    try {
      await socialAPI.removeRootStory(story.story_id, reason)
      setStoryReasons(current => ({ ...current, [story.story_id]: '' }))
      await loadStories()
    } catch (removeError) {
      setError(removeError.message || 'Could not remove this story.')
    } finally {
      setBusyId('')
    }
  }

  const openReports = data.reports.filter(report => report.status === 'open').length
  const safeReportsPage = Math.min(reportsPage, Math.max(0, Math.ceil(data.reports.length / PAGE_SIZE) - 1))
  const safePostsPage = Math.min(postsPage, Math.max(0, Math.ceil(data.posts.length / PAGE_SIZE) - 1))
  const safeStoriesPage = Math.min(storiesPage, Math.max(0, Math.ceil(data.stories.length / PAGE_SIZE) - 1))

  return (
    <section className="root-feed-management">
      <header className="root-feed-heading">
        <div>
          <h2>Feed Management</h2>
          <p>Manage reported posts and active stories across all accounts.</p>
        </div>
        <button
          type="button"
          className="root-feed-refresh"
          onClick={view === 'stories' ? loadStories : load}
          disabled={loading || storiesLoading}
        >
          {loading || storiesLoading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </header>

      <nav className="root-feed-tabs" aria-label="Feed moderation views">
        <button type="button" className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>
          Reports <span>{openReports}</span>
        </button>
        <button type="button" className={view === 'posts' ? 'active' : ''} onClick={() => setView('posts')}>
          All posts <span>{data.posts.length}</span>
        </button>
        <button type="button" className={view === 'stories' ? 'active' : ''} onClick={() => setView('stories')}>
          All stories <span>{data.stories.length}</span>
        </button>
      </nav>

      {error && <p className="root-feed-error" role="alert">{error}</p>}
      {loading || (view === 'stories' && storiesLoading) ? (
        <p className="root-feed-empty">Loading feed moderation…</p>
      ) : view === 'reports' ? (
        data.reports.length ? (
          <div className="root-feed-list">
            {getPageItems(data.reports, safeReportsPage).map(report => (
              <article className="root-feed-card" key={report.report_id}>
                <div className="root-feed-card-top">
                  <span className={`root-feed-status ${report.status}`}>{report.status}</span>
                  <time>{formatDate(report.created_at)}</time>
                </div>
                <div className="root-feed-account">
                  <strong>{report.poster_name}</strong>
                  <span>@{report.poster_username} · Account ID {report.poster_user_id}</span>
                </div>
                <div className="root-feed-report-reason">
                  <strong>Report: {report.reason}</strong>
                  {report.details && <p>{report.details}</p>}
                </div>
                <p className="root-feed-post-copy">{report.content || report.product_name || 'Post has no text.'}</p>
                <p className="root-feed-reporter">Reported by {report.reporter_name} (@{report.reporter_username})</p>
                {report.status === 'open' ? (
                  <div className="root-feed-review">
                    <label>
                      Review reason
                      <input
                        value={reviewReasons[report.report_id] || ''}
                        maxLength={500}
                        onChange={event => setReviewReasons(current => ({ ...current, [report.report_id]: event.target.value }))}
                        placeholder="Explain why this report is being dismissed"
                      />
                    </label>
                    <button type="button" onClick={() => reviewReport(report)} disabled={busyId === report.report_id}>
                      {busyId === report.report_id ? 'Saving…' : 'Dismiss report'}
                    </button>
                  </div>
                ) : (
                  <p className="root-feed-review-note">Review: {report.review_reason || 'No review reason recorded.'}</p>
                )}
              </article>
            ))}
            <Pagination page={safeReportsPage} itemCount={data.reports.length} onPageChange={setReportsPage} label="feed reports" />
          </div>
        ) : <p className="root-feed-empty">No posts have been reported.</p>
      ) : view === 'posts' ? data.posts.length ? (
        <div className="root-feed-list">
          {getPageItems(data.posts, safePostsPage).map(post => {
            const draft = actions[post.post_id] || {}
            const action = draft.action || (post.moderation_status === 'hidden' ? 'restore' : 'hide')
            return (
              <article className="root-feed-card" key={post.post_id}>
                <div className="root-feed-card-top">
                  <span className={`root-feed-status ${post.moderation_status}`}>{post.moderation_status}</span>
                  <time>{formatDate(post.created_at)}</time>
                </div>
                <div className="root-feed-account">
                  <strong>{post.full_name}</strong>
                  <span>@{post.username} · Account ID {post.user_id}</span>
                  {post.email && <span>{post.email}</span>}
                  <span>{post.role || 'user'} · {post.is_active ? 'Account active' : 'Account inactive'}</span>
                  {post.social_restricted ? <span className="root-feed-warning">Posting restricted: {post.social_restriction_reason}</span> : null}
                  {post.social_banned ? <span className="root-feed-warning">Account banned: {post.social_ban_reason}</span> : null}
                </div>
                <p className="root-feed-post-copy">{describePost(post)}</p>
                {post.product_image && <img className="root-feed-product-image" src={post.product_image} alt={post.product_name || 'Post product'} />}
                <div className="root-feed-post-stats">
                  <span>{post.open_report_count} open reports</span>
                  <span>{post.likes} likes</span>
                  <span>{post.comments} comments</span>
                  <span>{post.visibility}</span>
                </div>
                <div className="root-feed-moderation">
                  <label>
                    Action
                    <select
                      value={action}
                      onChange={event => setActions(current => ({ ...current, [post.post_id]: { ...current[post.post_id], action: event.target.value } }))}
                    >
                      <option value="hide" disabled={post.moderation_status === 'hidden'}>Hide post</option>
                      <option value="restore" disabled={post.moderation_status !== 'hidden'}>Restore post</option>
                      <option value="restrict" disabled={Boolean(post.social_restricted) || Boolean(post.social_banned)}>Restrict posting</option>
                      <option value="unrestrict" disabled={!post.social_restricted}>Remove posting restriction</option>
                      <option value="ban" disabled={Boolean(post.social_banned)}>Ban account</option>
                      <option value="unban" disabled={!post.social_banned}>Unban account</option>
                    </select>
                  </label>
                  <label>
                    Reason (required)
                    <input
                      value={draft.reason || ''}
                      maxLength={500}
                      onChange={event => setActions(current => ({ ...current, [post.post_id]: { ...current[post.post_id], action, reason: event.target.value } }))}
                      placeholder="Record the policy reason"
                    />
                  </label>
                  <button type="button" onClick={() => moderate(post)} disabled={busyId === post.post_id}>
                    {busyId === post.post_id ? 'Applying…' : 'Apply action'}
                  </button>
                </div>
                {post.moderation_reason && <p className="root-feed-review-note">Last moderation reason: {post.moderation_reason}</p>}
              </article>
            )
          })}
          <Pagination page={safePostsPage} itemCount={data.posts.length} onPageChange={setPostsPage} label="feed posts" />
        </div>
      ) : <p className="root-feed-empty">No feed posts found.</p> : data.stories.length ? (
        <div className="root-feed-list">
          {getPageItems(data.stories, safeStoriesPage).map(story => (
            <article className="root-feed-card" key={story.story_id}>
              <div className="root-feed-card-top">
                <span className="root-feed-status active">Active story</span>
                <time>Expires {formatDate(story.expires_at)}</time>
              </div>
              <div className="root-feed-account">
                <strong>{story.full_name}</strong>
                <span>@{story.username} · Account ID {story.user_id}</span>
              </div>
              {story.body && <p className="root-feed-post-copy">{story.body}</p>}
              {story.image_data && (
                <img className="root-feed-story-image" src={story.image_data} alt={`Story from ${story.full_name}`} />
              )}
              <div className="root-feed-post-stats">
                <span>{story.likes} likes</span>
                <span>{story.comments} comments</span>
                <span>{story.shares} shares</span>
              </div>
              <div className="root-feed-story-removal">
                <label>
                  Removal reason (required)
                  <input
                    value={storyReasons[story.story_id] || ''}
                    maxLength={500}
                    onChange={event => setStoryReasons(current => ({ ...current, [story.story_id]: event.target.value }))}
                    placeholder="Record the policy reason"
                  />
                </label>
                <button type="button" onClick={() => removeStory(story)} disabled={busyId === story.story_id}>
                  {busyId === story.story_id ? 'Removing…' : 'Remove story'}
                </button>
              </div>
            </article>
          ))}
          <Pagination page={safeStoriesPage} itemCount={data.stories.length} onPageChange={setStoriesPage} label="feed stories" />
        </div>
      ) : <p className="root-feed-empty">No active stories found.</p>}
    </section>
  )
}

export default RootFeedManagement
