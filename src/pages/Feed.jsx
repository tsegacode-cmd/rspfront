import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { socialAPI } from '../services/api'
import { getSocialShareLinks } from '../utils/socialSharing'
import { formatProviderUssd, getServicePaymentProviders } from '../utils/servicePaymentSettings'
import LoginRequiredModal from '../components/LoginRequiredModal'
import FeedLinkCampaigns from '../components/FeedLinkCampaigns'
import DailyGameRewards from '../components/DailyGameRewards'
import './SocialFeatures.css'
import '../components/BookingPaymentModal.css'

const STORY_COLORS = ['#8b0000', '#c41e3a', '#6d28d9', '#0369a1', '#047857', '#b45309']

const formatDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

const getCurrentUserId = () => {
  try { return String(JSON.parse(localStorage.getItem('userData') || '{}').id || '') }
  catch { return '' }
}

const parseSocialList = value => {
  if (Array.isArray(value)) return value.filter(item => item != null).map(item => String(item).trim()).filter(Boolean)
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'null') return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.filter(item => item != null).map(item => String(item).trim()).filter(Boolean)
    }
    if (typeof parsed === 'string') {
      return parsed.split(/[\s,]+/).map(item => item.trim()).filter(Boolean)
    }
    return []
  } catch {
    return trimmed.split(/[\s,]+/).map(item => item.trim()).filter(Boolean)
  }
}

const shareUrl = async (title, text, url) => {
  if (navigator.share) {
    await navigator.share({ title, text, url })
    return 'shared'
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url)
    return 'copied'
  }
  window.prompt('Copy this link', url)
  return 'copied'
}

const compressStoryImage = file => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('Could not read that image. Please try another file.'))
  reader.onload = () => {
    const image = new Image()
    image.onerror = () => reject(new Error('That file is not a valid image.'))
    image.onload = () => {
      const maxSide = 1000
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Could not process this image on your device.'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      let quality = 0.76
      let data = canvas.toDataURL('image/webp', quality)
      while (data.length > 1700000 && quality > 0.3) {
        quality -= 0.1
        data = canvas.toDataURL('image/webp', quality)
      }
      if (data.length > 1800000) {
        reject(new Error('Please choose a smaller cover photo.'))
        return
      }
      resolve(data)
    }
    image.src = String(reader.result)
  }
  reader.readAsDataURL(file)
})

function Feed() {
  const location = useLocation()
  const [posts, setPosts] = useState([])
  const [stories, setStories] = useState([])
  const [linkCampaignData, setLinkCampaignData] = useState({ campaigns: [], mine: [], pricing: null })
  const [activeFeedTab, setActiveFeedTab] = useState(() =>
    new URLSearchParams(window.location.search).get('tab') === 'daily-claim' ? 'daily-claim' : 'feed'
  )
  const [content, setContent] = useState('')
  const [productName, setProductName] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [productImage, setProductImage] = useState('')
  const [postLocation, setPostLocation] = useState('')
  const [mentions, setMentions] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [taggedFriends, setTaggedFriends] = useState('')
  const [activeMetadataField, setActiveMetadataField] = useState('')
  const [metadataQuery, setMetadataQuery] = useState('')
  const [metadataSuggestions, setMetadataSuggestions] = useState([])
  const [metadataSuggestionsLoading, setMetadataSuggestionsLoading] = useState(false)
  const [visibility, setVisibility] = useState('public')
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [storyBody, setStoryBody] = useState('')
  const [storyImage, setStoryImage] = useState('')
  const [storyColor, setStoryColor] = useState(STORY_COLORS[0])
  const [comments, setComments] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [storyComments, setStoryComments] = useState([])
  const [storyComment, setStoryComment] = useState('')
  const [boostRequests, setBoostRequests] = useState([])
  const [boostingPostId, setBoostingPostId] = useState('')
  const [boostDraft, setBoostDraft] = useState({ amount: '', paymentMethod: '', paymentReference: '', paymentProof: '' })
  const [boostProviders, setBoostProviders] = useState([])
  const [boostPaymentLoading, setBoostPaymentLoading] = useState(false)
  const [boostBusy, setBoostBusy] = useState(false)
  const [activeStory, setActiveStory] = useState(null)
  const [sharingPost, setSharingPost] = useState(null)
  const [shareFriends, setShareFriends] = useState([])
  const [loginPrompt, setLoginPrompt] = useState({ open: false, message: '' })
  const [selectedShareFriendIds, setSelectedShareFriendIds] = useState([])
  const [shareFriendsLoading, setShareFriendsLoading] = useState(false)
  const [shareFriendsBusy, setShareFriendsBusy] = useState(false)
  const [shareFriendsError, setShareFriendsError] = useState('')
  const [busy, setBusy] = useState(false)
  const [storyBusy, setStoryBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportingPostId, setReportingPostId] = useState('')
  const [reportDraft, setReportDraft] = useState({ reason: 'spam', details: '' })
  const [reportBusy, setReportBusy] = useState(false)
  const currentUserId = getCurrentUserId()

  const requireLogin = (message = 'Please log in to continue.') => {
    const loggedIn = Boolean(localStorage.getItem('authToken') && localStorage.getItem('userData'))
    if (!loggedIn) {
      setLoginPrompt({ open: true, message })
      return false
    }
    return true
  }

  const loadFeed = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [feedResponse, storyResponse, boostResponse, linkCampaignResponse] = await Promise.all([
        socialAPI.getFeed(),
        socialAPI.getStories(),
        socialAPI.getMyBoostRequests(),
        socialAPI.getLinkCampaigns(),
      ])
      const nextPosts = [...(feedResponse.data || [])].map(post => ({
        ...post,
        mentions: parseSocialList(post.mentions),
        hashtags: parseSocialList(post.hashtags),
        tagged_friends: parseSocialList(post.tagged_friends),
      })).sort((a, b) => {
        if (Boolean(a.boosted) !== Boolean(b.boosted)) return Number(Boolean(b.boosted)) - Number(Boolean(a.boosted))
        const aTime = Number(new Date(a.created_at || 0))
        const bTime = Number(new Date(b.created_at || 0))
        return bTime - aTime
      })
      setPosts(nextPosts)
      setStories(storyResponse.data)
      setBoostRequests(boostResponse.data)
      setLinkCampaignData(linkCampaignResponse.data)
    } catch (loadError) {
      setError(loadError.message || 'Could not load the feed.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadFeed() }, [loadFeed])

  useEffect(() => {
    if (new URLSearchParams(location.search).get('tab') === 'daily-claim') {
      setActiveFeedTab('daily-claim')
    }
  }, [location.search])

  useEffect(() => {
    if (!activeMetadataField || !metadataQuery.trim()) {
      setMetadataSuggestions([])
      setMetadataSuggestionsLoading(false)
      return undefined
    }
    let active = true
    const timer = window.setTimeout(async () => {
      if (activeMetadataField === 'mentions' || activeMetadataField === 'taggedFriends') {
        setMetadataSuggestionsLoading(true)
        try {
          const response = await socialAPI.getPeople(metadataQuery.trim())
          if (!response.success || !Array.isArray(response.data)) {
            throw new Error(response.message || 'Could not load matching people.')
          }
          if (active) {
            setMetadataSuggestions(response.data.slice(0, 6).map(person => ({
              value: person.username,
              label: `${person.full_name || person.username} · @${person.username}`,
            })))
          }
        } catch (suggestionError) {
          console.error('Could not load Feed people suggestions:', suggestionError)
          if (active) setMetadataSuggestions([])
        } finally {
          if (active) setMetadataSuggestionsLoading(false)
        }
        return
      }
      const values = activeMetadataField === 'location'
        ? posts.map(post => post.location).filter(Boolean)
        : posts.flatMap(post => Array.isArray(post.hashtags) ? post.hashtags : [])
      const uniqueValues = [...new Set(values.map(value => String(value).replace(/^[#@]/, '').trim()).filter(Boolean))]
      const matches = uniqueValues
        .filter(value => value.toLocaleLowerCase().includes(metadataQuery.trim().replace(/^[#@]/, '').toLocaleLowerCase()))
        .slice(0, 6)
      if (active) {
        setMetadataSuggestions(matches.map(value => ({
          value,
          label: activeMetadataField === 'hashtags' ? `#${value}` : value,
        })))
      }
    }, activeMetadataField === 'mentions' || activeMetadataField === 'taggedFriends' ? 250 : 100)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [activeMetadataField, metadataQuery, posts])

  useEffect(() => {
    const postId = new URLSearchParams(location.search).get('post')
    if (loading || !postId) return
    document.getElementById(`social-post-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading, location.search, posts])

  useEffect(() => {
    if (!activeStory) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => {
      if (event.key === 'Escape') setActiveStory(null)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [activeStory?.story_id])

  useEffect(() => {
    if (!sharingPost) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !shareFriendsBusy) setSharingPost(null)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [sharingPost, shareFriendsBusy])

  useEffect(() => {
    if (!selectedProfile) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => {
      if (event.key === 'Escape') setSelectedProfile(null)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [Boolean(selectedProfile)])

  useEffect(() => {
    if (!boostingPostId) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !boostBusy) setBoostingPostId('')
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [boostingPostId, boostBusy])

  const submit = async event => {
    event.preventDefault()
    if (!requireLogin('Please log in to publish a post.')) return
    setBusy(true)
    setError('')
    try {
      const mentionList = mentions.split(/[\s,]+/).map(item => item.trim()).filter(Boolean)
      const hashtagList = hashtags.split(/[\s,]+/).map(item => item.trim()).filter(Boolean).map(item => item.startsWith('#') ? item.slice(1) : item)
      const friendList = taggedFriends.split(/[\s,]+/).map(item => item.trim()).filter(Boolean).map(item => item.startsWith('@') ? item.slice(1) : item)
      await socialAPI.createPost({
        content,
        productName,
        productPrice: productPrice || null,
        productUrl,
        productImage: productImage || null,
        location: postLocation || null,
        mentions: mentionList,
        hashtags: hashtagList,
        taggedFriends: friendList,
        visibility
      })
      setContent('')
      setProductName('')
      setProductPrice('')
      setProductUrl('')
      setProductImage('')
      setPostLocation('')
      setMentions('')
      setHashtags('')
      setTaggedFriends('')
      const productImageInput = document.getElementById('social-product-image')
      if (productImageInput) productImageInput.value = ''
      setVisibility('public')
      await loadFeed()
    } catch (postError) {
      setError(postError.message || 'Could not publish your post.')
    } finally {
      setBusy(false)
    }

  }

  const metadataFields = [
    { key: 'location', value: postLocation, setter: setPostLocation, placeholder: 'Add location', prefix: '' },
    { key: 'mentions', value: mentions, setter: setMentions, placeholder: 'Mention friends (@username)', prefix: '@' },
    { key: 'hashtags', value: hashtags, setter: setHashtags, placeholder: 'Add hashtags (#tag)', prefix: '#' },
    { key: 'taggedFriends', value: taggedFriends, setter: setTaggedFriends, placeholder: 'Tag friends (@friend)', prefix: '@' },
  ]
  const updateMetadataQuery = (field, value) => {
    const lastSegment = value.slice(value.lastIndexOf(',') + 1).trim()
    setActiveMetadataField(field)
    setMetadataQuery(lastSegment.replace(/^[@#]/, ''))
  }
  const selectMetadataSuggestion = (field, suggestion) => {
    const current = field.value
    const commaIndex = current.lastIndexOf(',')
    const prefix = commaIndex >= 0 ? `${current.slice(0, commaIndex + 1)} ` : ''
    field.setter(`${prefix}${field.prefix}${suggestion.value}`)
    setActiveMetadataField('')
    setMetadataSuggestions([])
  }

  const openBoostDialog = async post => {
    if (boostRequests.some(item => item.post_id === post.post_id)) return
    setBoostingPostId(post.post_id)
    setBoostDraft({ amount: '', paymentMethod: '', paymentReference: '', paymentProof: '' })
    setBoostPaymentLoading(true)
    setError('')
    try {
      setBoostProviders((await getServicePaymentProviders()).filter(provider =>
        provider.id !== 'Chapa' &&
        provider.serviceEnabled !== false &&
        (!provider.accounts?.length || provider.accounts.some(account => account.serviceEnabled !== false))
      ))
    } catch (providerError) {
      setError(providerError.message || 'Could not load payment methods.')
    } finally {
      setBoostPaymentLoading(false)
    }
  }

  const submitBoostRequest = async (event, post) => {
    event.preventDefault()
    setBoostBusy(true)
    setError('')
    try {
      await socialAPI.requestBoost({
        postId: post.post_id,
        amount: boostDraft.amount,
        paymentMethod: boostDraft.paymentMethod,
        paymentReference: boostDraft.paymentReference,
        paymentProof: boostDraft.paymentProof || null,
      })
      setBoostingPostId('')
      setBoostDraft({ amount: '', paymentMethod: '', paymentReference: '', paymentProof: '' })
      await loadFeed()
      setError('Boost request sent to root for payment review.')
    } catch (requestError) {
      setError(requestError.message || 'Could not submit the boost request.')
    } finally {
      setBoostBusy(false)
    }
  }

  const createStory = async event => {
    event.preventDefault()
    if (!requireLogin('Please log in to share a story.')) return
    setStoryBusy(true)
    setError('')
    try {
      const response = await socialAPI.createStory({
        body: storyBody,
        coverColor: storyColor,
        imageData: storyImage || null
      })
      setStories(current => [response.data, ...current])
      setStoryBody('')
      setStoryImage('')
      const imageInput = document.getElementById('story-cover-image')
      if (imageInput) imageInput.value = ''
    } catch (storyError) {
      setError(storyError.message || 'Could not publish your story.')
    } finally {
      setStoryBusy(false)
    }
  }

  const loadStoryComments = async story => {
    try {
      const response = await socialAPI.getStoryComments(story.story_id)
      setStoryComments(response.data)
    } catch (commentError) {
      setError(commentError.message || 'Could not load story comments.')
    }
  }

  const openStory = story => {
    setActiveStory(story)
    setStoryComments([])
    setStoryComment('')
    loadStoryComments(story)
  }

  const addStoryComment = async event => {
    event.preventDefault()
    if (!requireLogin('Please log in to comment on stories.')) return
    if (!activeStory || !storyComment.trim()) return
    try {
      const response = await socialAPI.commentStory(activeStory.story_id, storyComment.trim())
      setStoryComments(current => [...current, response.data])
      setStories(current => current.map(story => story.story_id === activeStory.story_id
        ? { ...story, comments: Number(story.comments) + 1 }
        : story))
      setStoryComment('')
    } catch (commentError) {
      setError(commentError.message || 'Could not add your comment.')
    }
  }

  const trackPostShare = async post => {
    const response = await socialAPI.sharePost(post.post_id)
    if (response.data.shared) {
      setPosts(current => current.map(item => item.post_id === post.post_id
        ? { ...item, shares: Number(item.shares) + 1 }
        : item))
    }
  }

  const openPostShare = async post => {
    setSharingPost(post)
    setShareFriends([])
    setSelectedShareFriendIds([])
    setShareFriendsError('')
    setShareFriendsLoading(true)
    try {
      const response = await socialAPI.getFriends()
      const friends = [...new Map(
        [...response.data.following, ...response.data.followers]
          .map(friend => [String(friend.user_id), friend])
      ).values()]
      setShareFriends(friends)
    } catch (loadError) {
      setShareFriendsError(loadError.message || 'Could not load your friends.')
    } finally {
      setShareFriendsLoading(false)
    }
  }

  const sendPostToFriends = async event => {
    event.preventDefault()
    if (!requireLogin('Please log in to share a post with friends.')) return
    if (!sharingPost || !selectedShareFriendIds.length) return
    setShareFriendsBusy(true)
    setShareFriendsError('')
    const recipientIds = [...selectedShareFriendIds]
    const url = `${window.location.origin}/feed?post=${encodeURIComponent(sharingPost.post_id)}`
    const message = `Check out this post by ${sharingPost.full_name || sharingPost.username} on REDSEA:\n${url}`
    try {
      const results = await Promise.allSettled(recipientIds.map(friendId =>
        socialAPI.sendMessage(friendId, message)
      ))
      const sentCount = results.filter(result => result.status === 'fulfilled').length
      const failedCount = results.length - sentCount
      const failedRecipientIds = results.flatMap((result, index) => result.status === 'rejected' ? [recipientIds[index]] : [])
      if (!sentCount) {
        const firstFailure = results.find(result => result.status === 'rejected')
        throw firstFailure?.reason || new Error('Could not send this post to your friends.')
      }

      let trackingError = ''
      try {
        await trackPostShare(sharingPost)
      } catch (error) {
        trackingError = error.message || 'Share statistics could not be updated.'
      }
      if (failedCount) {
        setSelectedShareFriendIds(failedRecipientIds)
        setShareFriendsError(`Sent to ${sentCount} friend${sentCount === 1 ? '' : 's'}; ${failedCount} could not be reached. You can retry the selected friends.${trackingError ? ` ${trackingError}` : ''}`)
        return
      }
      setSharingPost(null)
      setError(trackingError
        ? `Post sent to ${sentCount} friend${sentCount === 1 ? '' : 's'}, but ${trackingError}`
        : `Post sent to ${sentCount} friend${sentCount === 1 ? '' : 's'}.`)
    } catch (shareError) {
      setShareFriendsError(shareError.message || 'Could not share this post with your friends.')
    } finally {
      setShareFriendsBusy(false)
    }
  }

  const deletePost = async post => {
    if (!requireLogin('Please log in to manage posts.')) return
    if (!window.confirm('Delete this post? This will also remove reposts of it.')) return
    setError('')
    try {
      const response = await socialAPI.deletePost(post.post_id)
      const deletedPostIds = new Set(response.data.postIds)
      setPosts(current => current.filter(item => !deletedPostIds.has(item.post_id)))
      setComments(current => {
        const next = { ...current }
        deletedPostIds.forEach(postId => { delete next[postId] })
        return next
      })
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete your post.')
    }
  }

  const reportPost = async (event, post) => {
    event.preventDefault()
    if (!requireLogin('Please log in to report a post.')) return
    setReportBusy(true)
    setError('')
    try {
      await socialAPI.reportPost(post.post_id, reportDraft.reason, reportDraft.details)
      setReportingPostId('')
      setReportDraft({ reason: 'spam', details: '' })
      setError('Thank you. Your report was sent to the moderation team.')
    } catch (reportError) {
      setError(reportError.message || 'Could not submit your report.')
    } finally {
      setReportBusy(false)
    }
  }

  const updatePost = async (post, action) => {
    setError('')
    try {
      if (action === 'like') {
        const response = await socialAPI.likePost(post.post_id)
        setPosts(current => current.map(item => item.post_id === post.post_id
          ? { ...item, liked: response.data.liked, likes: response.data.likes }
          : item))
      } else if (action === 'comments') {
        if (comments[post.post_id]?.open) {
          setComments(current => ({ ...current, [post.post_id]: { ...current[post.post_id], open: false } }))
        } else {
          const response = await socialAPI.getPostComments(post.post_id)
          setComments(current => ({ ...current, [post.post_id]: { items: response.data, open: true } }))
        }
      } else if (action === 'share') {
        await openPostShare(post)
      } else if (action === 'repost') {
        await socialAPI.repostPost(post.post_id)
        await loadFeed()
      } else if (action === 'copy') {
        const copiedText = post.content || post.product_name || ''
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(copiedText)
        else window.prompt('Copy this post text', copiedText)
        setError('Post text copied.')
      }
    } catch (actionError) {
      if (actionError.name !== 'AbortError') setError(actionError.message || 'That action could not be completed.')
    }

    const copyProductLink = async post => {
      if (!post.product_url) return
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(post.product_url)
        else window.prompt('Copy this product link', post.product_url)
        setError('Product link copied.')
      } catch (copyError) {
        setError(copyError.message || 'Could not copy the product link.')
      }
    }
  }

  const addPostComment = async (event, post) => {
    event.preventDefault()
    if (!requireLogin('Please log in to comment on posts.')) return
    const body = commentDrafts[post.post_id]?.trim()
    if (!body) return
    try {
      const response = await socialAPI.commentPost(post.post_id, body)
      setComments(current => ({
        ...current,
        [post.post_id]: {
          open: true,
          items: [...(current[post.post_id]?.items || []), response.data]
        }
      }))
      setPosts(current => current.map(item => item.post_id === post.post_id
        ? { ...item, comments: Number(item.comments) + 1 }
        : item))
      setCommentDrafts(current => ({ ...current, [post.post_id]: '' }))
    } catch (commentError) {
      setError(commentError.message || 'Could not add your comment.')
    }
  }

  const likeStory = async story => {
    try {
      const response = await socialAPI.likeStory(story.story_id)
      setStories(current => current.map(item => item.story_id === story.story_id
        ? { ...item, liked: response.data.liked, likes: response.data.likes }
        : item))
      setActiveStory(current => current?.story_id === story.story_id
        ? { ...current, liked: response.data.liked, likes: response.data.likes }
        : current)
    } catch (likeError) {
      setError(likeError.message || 'Could not like this story.')
    }
  }

  const trackStoryShare = async story => {
    await socialAPI.shareStory(story.story_id)
    setStories(current => current.map(item => item.story_id === story.story_id
      ? { ...item, shares: Number(item.shares) + 1 }
      : item))
  }

  const shareStory = async story => {
    try {
      const url = `${window.location.origin}/feed?story=${encodeURIComponent(story.story_id)}`
      const result = await shareUrl('REDSEA story', story.body, url)
      await trackStoryShare(story)
      setError(result === 'shared' ? 'Story shared.' : 'Story link copied.')
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setError(shareError.message || 'Could not share this story.')
    }
  }

  const openProfile = async post => {
    setSelectedProfile({ username: post.username, full_name: post.full_name, posts: [] })
    setProfileLoading(true)
    setProfileError('')
    try {
      const response = await socialAPI.getProfile(post.user_id)
      setSelectedProfile(response.data)
    } catch (profileLoadError) {
      setProfileError(profileLoadError.message || 'Could not load this profile.')
    } finally {
      setProfileLoading(false)
    }
  }

  const activeStoryUrl = activeStory
    ? `${window.location.origin}/feed?story=${encodeURIComponent(activeStory.story_id)}`
    : ''
  const activeStoryShareLinks = activeStory
    ? getSocialShareLinks('REDSEA story', activeStory.body || '', activeStoryUrl)
    : null

  return (
    <>
    <main className="social-page">
      <div className="social-page-heading">
        <div><p className="social-kicker">REDSEA COMMUNITY</p><h1>Feed</h1><p>Share updates, products, and good news with your network.</p></div>
      </div>

      <div className="social-feed-layout">
        <nav className="social-feed-menu" aria-label="Feed menu">
          <button type="button" className={activeFeedTab === 'feed' ? 'selected' : ''} onClick={() => setActiveFeedTab('feed')}>
            <span aria-hidden="true">📰</span> Feed posts
          </button>
          <button type="button" className={activeFeedTab === 'stories' ? 'selected' : ''} onClick={() => setActiveFeedTab('stories')}>
            <span aria-hidden="true">⭕</span> Stories
          </button>
          <button type="button" className={activeFeedTab === 'compose' ? 'selected' : ''} onClick={() => setActiveFeedTab('compose')}>
            <span aria-hidden="true">✍️</span> Create a post
          </button>
          <button type="button" className={activeFeedTab === 'links' ? 'selected' : ''} onClick={() => setActiveFeedTab('links')}>
            <span aria-hidden="true">🎬</span> Video Claim &amp; Earn
          </button>
          <button type="button" className={activeFeedTab === 'daily-claim' ? 'selected' : ''} onClick={() => setActiveFeedTab('daily-claim')}>
            <span aria-hidden="true">🎁</span> Daily Claim
          </button>
        </nav>
        <div className="social-feed-content">
          {activeFeedTab === 'links' && (
            <FeedLinkCampaigns
              data={linkCampaignData}
              userLoggedIn={Boolean(localStorage.getItem('authToken') && localStorage.getItem('userData'))}
              requireLogin={requireLogin}
              onRefresh={loadFeed}
            />
          )}
          {activeFeedTab === 'daily-claim' && <DailyGameRewards requireLogin={requireLogin} />}

      {(activeFeedTab === 'feed' || activeFeedTab === 'stories') && <section className="social-stories-section" aria-label="Stories">
        <div className="social-section-heading"><div><h2>Stories</h2><p>Stories disappear after 24 hours.</p></div></div>
        <div className="social-story-rail">
          <form className="social-story-create" onSubmit={createStory}>
            <div className="social-story-preview" style={{ backgroundColor: storyColor, backgroundImage: storyImage ? `linear-gradient(#0002,#0005), url("${storyImage}")` : undefined }}>
              <textarea maxLength={500} value={storyBody} onChange={event => setStoryBody(event.target.value)} placeholder="Share a quick story…" aria-label="Story text" />
              <label className="social-story-image-label" htmlFor="story-cover-image">📷 Add cover photo</label>
              <input id="story-cover-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
                const file = event.target.files?.[0]
                if (!file) return
                try { setStoryImage(await compressStoryImage(file)); setError('') }
                catch (imageError) { setError(imageError.message) }
              }} />
            </div>
            <div className="social-story-controls">
              <div className="social-story-colors" aria-label="Story background color">
                {STORY_COLORS.map(color => (
                  <button key={color} type="button" className={storyColor === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => setStoryColor(color)} aria-label={`Choose ${color} background`} />
                ))}
              </div>
              <button type="submit" disabled={storyBusy || (!storyBody.trim() && !storyImage)}>{storyBusy ? 'Posting…' : 'Share story'}</button>
            </div>
          </form>
          {stories.map(story => (
            <button type="button" className="social-story-card" key={story.story_id} onClick={() => openStory(story)} style={{ backgroundColor: story.cover_color, backgroundImage: story.image_data ? `linear-gradient(#0002,#0007), url("${story.image_data}")` : 'linear-gradient(145deg, #0001, #0007)' }}>
              <span className="social-story-author">{(story.full_name || story.username).slice(0, 1).toUpperCase()}</span>
              <span className="social-story-text">{story.body || 'View story'}</span>
              <small>{story.full_name || story.username}</small>
            </button>
          ))}
        </div>
      </section>}

      {(activeFeedTab === 'feed' || activeFeedTab === 'compose') && <form className="social-composer" onSubmit={submit}>
        <h2>Create a post</h2>
        <textarea value={content} maxLength={2000} onChange={event => setContent(event.target.value)} placeholder="What would you like to share?" />
        <details className="social-product-details">
          <summary>Attach a product</summary>
          <div className="social-product-fields">
            <input value={productName} maxLength={160} onChange={event => setProductName(event.target.value)} placeholder="Product name" />
            <input type="number" min="0" step="0.01" value={productPrice} onChange={event => setProductPrice(event.target.value)} placeholder="Price" />
            <input type="url" value={productUrl} maxLength={500} onChange={event => setProductUrl(event.target.value)} placeholder="Product link (https://...)" />
            <label className="social-product-image-field" htmlFor="social-product-image">Product image
              <input id="social-product-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
                const file = event.target.files?.[0]
                if (!file) return
                try {
                  setProductImage(await compressStoryImage(file))
                  setError('')
                } catch (imageError) {
                  setError(imageError.message)
                }
              }} />
            </label>
            {productImage && (
              <div className="social-product-image-preview">
                <img src={productImage} alt="Product preview" />
                <button type="button" onClick={() => {
                  setProductImage('')
                  const input = document.getElementById('social-product-image')
                  if (input) input.value = ''
                }}>Remove image</button>
              </div>
            )}
          </div>
        </details>
        <div className="social-metadata-fields">
          {metadataFields.map(field => (
            <div className="social-metadata-field" key={field.key}>
              <input
                value={field.value}
                maxLength={field.key === 'location' ? 160 : 500}
                onFocus={() => updateMetadataQuery(field.key, field.value)}
                onChange={event => {
                  field.setter(event.target.value)
                  updateMetadataQuery(field.key, event.target.value)
                }}
                onBlur={() => window.setTimeout(() => setActiveMetadataField(current => current === field.key ? '' : current), 120)}
                onKeyDown={event => {
                  if (event.key === 'Escape') setActiveMetadataField('')
                  if (event.key === 'ArrowDown' && metadataSuggestions.length) {
                    event.preventDefault()
                    document.querySelector(`[data-metadata-suggestion="${field.key}"]`)?.focus()
                  }
                }}
                placeholder={field.placeholder}
                aria-label={field.placeholder}
                aria-autocomplete="list"
                aria-controls={`social-${field.key}-suggestions`}
                aria-expanded={activeMetadataField === field.key && (metadataSuggestions.length > 0 || metadataSuggestionsLoading)}
              />
              {activeMetadataField === field.key && (metadataSuggestions.length > 0 || metadataSuggestionsLoading) && (
                <div id={`social-${field.key}-suggestions`} className="social-metadata-suggestions" role="listbox">
                  {metadataSuggestionsLoading
                    ? <span className="social-metadata-suggestion-loading">Searching people…</span>
                    : metadataSuggestions.map((suggestion, index) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected="false"
                          data-metadata-suggestion={field.key}
                          key={`${field.key}-${suggestion.value}`}
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => selectMetadataSuggestion(field, suggestion)}
                        >
                          {suggestion.label}
                          <span className="sr-only"> suggestion {index + 1}</span>
                        </button>
                      ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <label className="social-audience-field">
          <span>Who can see this post?</span>
          <select value={visibility} onChange={event => setVisibility(event.target.value)}>
            <option value="public">Everyone</option>
            <option value="friends">Friends only</option>
            <option value="private">Only me</option>
          </select>
        </label>
        <div className="social-compose-footer"><small>{content.length}/2000</small><button disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</button></div>
      </form>}

      {error && <p className="social-status" role="status">{error}</p>}
      {activeFeedTab === 'feed' && loading && <p className="social-muted">Loading feed…</p>}
      {activeFeedTab === 'feed' && !loading && !posts.length && <section className="social-empty"><span>📰</span><h2>Your feed starts here</h2><p>Share a post or follow people to grow your community.</p></section>}
      {activeFeedTab === 'feed' && <section className="social-feed-list">
        {posts.map(post => {
            const url = `${window.location.origin}/feed?post=${encodeURIComponent(post.post_id)}`
            const shareLinks = getSocialShareLinks('REDSEA community post', post.content || post.product_name || '', url)
            const postBoostRequest = boostRequests.find(item => item.post_id === post.post_id)
            return (
              <article id={`social-post-${post.post_id}`} className={`social-post ${post.boosted ? 'boosted' : ''}`} key={post.post_id}>
                <header>
                  <button type="button" className="social-avatar social-author-avatar" onClick={() => openProfile(post)} aria-label={`View ${post.full_name || post.username}'s profile`}>
                    {(post.full_name || 'R').slice(0, 1).toUpperCase()}
                  </button>
                  <div>
                    <button type="button" className="social-author-name" onClick={() => openProfile(post)}>{post.full_name || post.username}</button>
                    <small>@{post.username} · {formatDate(post.created_at)} · {post.visibility === 'friends' ? '👥 Friends' : post.visibility === 'private' ? '🔒 Only me' : '🌐 Public'}</small>
                    <small className={`social-presence ${post.is_online ? 'online' : 'offline'}`}>
                      <span aria-hidden="true" />{post.is_online ? 'Online' : 'Offline'}{post.role ? ` · ${post.role}` : ''}
                    </small>
                  </div>
                  {post.boosted && <span className="social-boosted-label">Sponsored</span>}
                </header>
                {post.repost_of && <p className="social-repost-label">↻ Reposted @{post.original_username || 'member'}</p>}
                {post.content && <p className="social-post-copy">{post.content}</p>}
                {(post.location || post.mentions || post.hashtags || post.tagged_friends) && (
                  <div className="social-post-meta">
                    {post.location && <span className="social-post-location">📍 {post.location}</span>}
                    {Array.isArray(post.mentions) && post.mentions.length > 0 && <span className="social-post-tag">@{post.mentions.join(' @')}</span>}
                    {Array.isArray(post.hashtags) && post.hashtags.length > 0 && <span className="social-post-tag">#{post.hashtags.join(' #')}</span>}
                    {Array.isArray(post.tagged_friends) && post.tagged_friends.length > 0 && <span className="social-post-tag">with @{post.tagged_friends.join(' @')}</span>}
                  </div>
                )}
                {(post.product_name || post.product_image) && (
                  <div className="social-product-card">
                    {post.product_image
                      ? <img className="social-product-image" src={post.product_image} alt={post.product_name || 'Product'} />
                      : <div className="social-product-icon">🛍️</div>}
                    <div><strong>{post.product_name || 'Product'}</strong>{post.product_price != null && <span>{Number(post.product_price).toLocaleString()} ETB</span>}</div>
                    {post.product_url && <a href={post.product_url} target="_blank" rel="noreferrer">View product →</a>}
                  </div>
                )}
                {post.repost_of && (post.original_content || post.original_product_name) && (
                  <blockquote>
                    {post.original_content}
                    {post.original_product_name && (
                      <>
                        {post.original_product_image && <img className="social-repost-product-image" src={post.original_product_image} alt={post.original_product_name} />}
                        <strong>🛍️ {post.original_product_name}</strong>
                      </>
                    )}
                  </blockquote>
                )}
                <div className="social-post-stats"><span>♥ {post.likes} likes</span><span>💬 {post.comments || 0} comments</span><span>↗ {post.shares} shares</span></div>
                <div className="social-post-actions">
                  <button type="button" className={post.liked ? 'selected' : ''} onClick={() => updatePost(post, 'like')}>{post.liked ? '♥ Liked' : '♡ Like'}</button>
                  <button type="button" className={comments[post.post_id]?.open ? 'selected' : ''} onClick={() => updatePost(post, 'comments')}>💬 Comment</button>
                  {post.visibility !== 'private' && <>
                    <button type="button" onClick={() => updatePost(post, 'repost')}>↻ Repost</button>
                    <button type="button" onClick={() => updatePost(post, 'share')}>↗ Share</button>
                    {post.product_url && <button type="button" onClick={() => copyProductLink(post)}>🔗 Copy product link</button>}
                    <a className="social-share-link" href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => trackPostShare(post).catch(shareError => setError(shareError.message || 'Could not share this post.'))}>WhatsApp</a>
                    <a className="social-share-link" href={shareLinks.telegram} target="_blank" rel="noopener noreferrer" onClick={() => trackPostShare(post).catch(shareError => setError(shareError.message || 'Could not share this post.'))}>Telegram</a>
                  </>}
                  {String(post.user_id) === currentUserId && post.visibility === 'public' && !post.boosted &&
                    !boostRequests.some(item => item.post_id === post.post_id) && (
                    <button type="button" onClick={() => openBoostDialog(post)}>
                      🚀 Request boost
                    </button>
                  )}
                  {String(post.user_id) === currentUserId && <button type="button" className="social-delete-post" onClick={() => deletePost(post)}>Delete</button>}
                  {String(post.user_id) !== currentUserId && (
                    <button
                      type="button"
                      className="social-report-post"
                      onClick={() => {
                        setReportingPostId(current => current === post.post_id ? '' : post.post_id)
                        setReportDraft({ reason: 'spam', details: '' })
                        setError('')
                      }}
                    >
                      Report
                    </button>
                  )}
                </div>
                {reportingPostId === post.post_id && (
                  <form className="social-report-form" onSubmit={event => reportPost(event, post)}>
                    <label>
                      Report reason
                      <select value={reportDraft.reason} onChange={event => setReportDraft(current => ({ ...current, reason: event.target.value }))}>
                        <option value="spam">Spam</option>
                        <option value="harassment">Harassment</option>
                        <option value="hate">Hate or abuse</option>
                        <option value="scam">Scam or fraud</option>
                        <option value="misinformation">Misinformation</option>
                        <option value="inappropriate">Inappropriate content</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Additional details (optional)
                      <textarea
                        maxLength={500}
                        value={reportDraft.details}
                        onChange={event => setReportDraft(current => ({ ...current, details: event.target.value }))}
                        placeholder="Tell the moderation team what happened"
                      />
                    </label>
                    <div>
                      <button type="submit" disabled={reportBusy}>{reportBusy ? 'Sending…' : 'Submit report'}</button>
                      <button type="button" onClick={() => setReportingPostId('')} disabled={reportBusy}>Cancel</button>
                    </div>
                  </form>
                )}
                {postBoostRequest && (
                  <p className={`social-boost-request-status ${postBoostRequest.status}`}>
                    Boost request: {postBoostRequest.status}
                  </p>
                )}
                {comments[post.post_id]?.open && (
                  <section className="social-comments" aria-label="Post comments">
                    {!comments[post.post_id].items.length && <p className="social-muted">No comments yet. Start the conversation.</p>}
                    {comments[post.post_id].items.map(comment => (
                      <article className="social-comment" key={comment.comment_id}>
                        <strong>{comment.full_name || comment.username}</strong><small>{formatDate(comment.created_at)}</small><p>{comment.body}</p>
                      </article>
                    ))}
                    <form className="social-comment-form" onSubmit={event => addPostComment(event, post)}>
                      <input value={commentDrafts[post.post_id] || ''} maxLength={1000} onChange={event => setCommentDrafts(current => ({ ...current, [post.post_id]: event.target.value }))} placeholder="Write a comment…" aria-label="Write a comment" required />
                      <button type="submit">Send</button>
                    </form>
                  </section>
                )}
              </article>
            )
          })}
      </section>}
        </div>
      </div>

      {sharingPost && (
        createPortal(
          <div className="social-popup-overlay social-share-popup-overlay" onMouseDown={event => {
            if (event.target === event.currentTarget && !shareFriendsBusy) setSharingPost(null)
          }}>
            <section className="social-popup" role="dialog" aria-modal="true" aria-labelledby="social-share-dialog-title">
              <header>
                <div>
                  <small>REDSEA COMMUNITY</small>
                  <strong id="social-share-dialog-title">Share post with friends</strong>
                </div>
                <button type="button" onClick={() => setSharingPost(null)} disabled={shareFriendsBusy} aria-label="Close share dialog">×</button>
              </header>
              <div className="social-popup-content">
                <div className="social-share-post-preview">
                  <span className="social-share-post-avatar" aria-hidden="true">
                    {(sharingPost.full_name || sharingPost.username || 'R').slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{sharingPost.full_name || sharingPost.username}</strong>
                    <small>Post preview</small>
                    <p>{sharingPost.content || sharingPost.product_name || 'Shared a post on REDSEA.'}</p>
                  </div>
                </div>
                <p className="social-muted">Choose friends to send this post in a REDSEA message.</p>
                {shareFriendsError && <p className="social-status" role="alert">{shareFriendsError}</p>}
                {shareFriendsLoading && <p className="social-muted">Loading friends…</p>}
                {!shareFriendsLoading && !shareFriends.length && !shareFriendsError && (
                  <p className="social-muted">No friends to share with yet. Follow someone or connect with them first.</p>
                )}
                {!shareFriendsLoading && !!shareFriends.length && (
                  <form onSubmit={sendPostToFriends}>
                    <div className="social-share-friend-list">
                      {shareFriends.map(friend => {
                        const friendId = String(friend.user_id)
                        return (
                          <label className="social-share-friend" key={friendId}>
                            <input
                              type="checkbox"
                              disabled={shareFriendsBusy}
                              checked={selectedShareFriendIds.includes(friendId)}
                              onChange={event => setSelectedShareFriendIds(current => event.target.checked
                                ? [...current, friendId]
                                : current.filter(id => id !== friendId))}
                            />
                            <span><strong>{friend.full_name}</strong><small>@{friend.username}</small></span>
                          </label>
                        )
                      })}
                    </div>
                    <div className="social-share-dialog-actions">
                      <button type="submit" disabled={shareFriendsBusy || !selectedShareFriendIds.length}>
                        {shareFriendsBusy ? 'Sending…' : `Send to ${selectedShareFriendIds.length || 'friends'}`}
                      </button>
                      <button type="button" className="social-share-cancel" disabled={shareFriendsBusy} onClick={() => setSharingPost(null)}>Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            </section>
          </div>,
          document.body
        )
      )}

      {boostingPostId && (() => {
        const post = posts.find(item => item.post_id === boostingPostId)
        const provider = boostProviders.find(item => item.id === boostDraft.paymentMethod)
        const accounts = provider?.accounts?.length
          ? provider.accounts.filter(account => account.serviceEnabled !== false)
          : provider ? [{
              id: `${provider.id}-default`,
              accountName: provider.accountName,
              phone: provider.phone,
              accountNumber: provider.accountNumber,
              bankName: provider.bankName,
              ussdTemplate: provider.ussdTemplate,
            }] : []
        const account = accounts[0]
        const activeProvider = provider && account ? { ...provider, ...account } : provider
        const ussd = activeProvider ? formatProviderUssd(activeProvider, Number(boostDraft.amount)) : ''
        return post ? (
          <div className="booking-payment-overlay" onMouseDown={event => {
            if (event.target === event.currentTarget && !boostBusy) setBoostingPostId('')
          }}>
            <form className="booking-payment-modal social-boost-modal" role="dialog" aria-modal="true" aria-labelledby="social-boost-title" onSubmit={event => submitBoostRequest(event, post)}>
              <button type="button" className="booking-payment-close" onClick={() => setBoostingPostId('')} aria-label="Close boost dialog">×</button>
              <span className="booking-payment-icon">🚀</span>
              <h2 id="social-boost-title">Boost your post</h2>
              <p className="booking-payment-item">{post.product_name || post.content || post.product_url || 'Your post'}</p>
              <p className="booking-payment-note">Choose a payment method and submit your payment details. Your public post will be promoted in the feed and marketplace after Root reviews and approves the request.</p>
              <label className="social-boost-amount">
                Boost payment amount (ETB)
                <input type="number" min="1" max="100000000" step="0.01" required value={boostDraft.amount} onChange={event => setBoostDraft(current => ({ ...current, amount: event.target.value }))} />
              </label>
              {boostPaymentLoading ? <p className="social-muted">Loading payment methods…</p> : (
                <div className="booking-payment-options" aria-label="Payment methods">
                  {boostProviders.map(method => (
                    <button
                      type="button"
                      className={`booking-payment-method ${boostDraft.paymentMethod === method.id ? 'selected' : ''}`}
                      key={method.id}
                      onClick={() => setBoostDraft(current => ({ ...current, paymentMethod: method.id }))}
                    >
                      {method.logo ? <img src={method.logo} alt="" /> : <span className="booking-payment-method-icon">{method.id === 'Bank' ? '🏦' : '📱'}</span>}
                      <span>{method.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {!boostPaymentLoading && boostProviders.length === 0 && <p className="booking-payment-error">No payment methods are available. Please contact support.</p>}
              {provider && (
                <div className="booking-payment-provider-details">
                  <strong>{provider.name} payment details</strong>
                  {provider.id === 'Bank' ? (
                    <>
                      <span>Account name: {account?.accountName || 'Not configured'}</span>
                      <span>Bank: {account?.bankName || 'Not configured'}</span>
                      <span>Account number: {account?.accountNumber || 'Not configured'}</span>
                    </>
                  ) : (
                    <>
                      <span>Account name: {activeProvider?.accountName || 'Not configured'}</span>
                      {activeProvider?.phone && <span>Wallet phone: {activeProvider.phone}</span>}
                      {ussd && <a className="booking-payment-dial" href={`tel:${ussd.replaceAll('#', '%23')}`}>Pay ETB {Number(boostDraft.amount || 0).toLocaleString()} and open dialer</a>}
                    </>
                  )}
                </div>
              )}
              <label className="social-boost-reference">
                Payment transaction reference
                <input maxLength={160} required value={boostDraft.paymentReference} onChange={event => setBoostDraft(current => ({ ...current, paymentReference: event.target.value }))} placeholder="Enter the receipt / transaction ID" />
              </label>
              <label className="social-boost-proof">
                Optional payment proof
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  try {
                    const paymentProof = await compressStoryImage(file)
                    setBoostDraft(current => ({ ...current, paymentProof }))
                    setError('')
                  } catch (proofError) {
                    setError(proofError.message)
                  } finally {
                    event.target.value = ''
                  }
                }} />
              </label>
              {boostDraft.paymentProof && <img className="social-boost-proof-preview" src={boostDraft.paymentProof} alt="Payment proof preview" />}
              <div className="social-boost-modal-actions">
                <button type="submit" className="booking-payment-confirm" disabled={boostBusy || boostPaymentLoading || !provider}>{boostBusy ? 'Sending request…' : 'Send boost request'}</button>
                <button type="button" className="social-boost-cancel" disabled={boostBusy} onClick={() => setBoostingPostId('')}>Cancel</button>
              </div>
              {error && <p className="booking-payment-error" role="alert">{error}</p>}
            </form>
          </div>
        ) : null
      })()}

      <LoginRequiredModal
        isOpen={loginPrompt.open}
        message={loginPrompt.message}
        onClose={() => setLoginPrompt({ open: false, message: '' })}
      />

      {selectedProfile && (
        <div className="social-popup-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedProfile(null) }}>
          <section className="social-popup social-profile-popup" role="dialog" aria-modal="true" aria-label={`${selectedProfile.full_name || selectedProfile.username}'s profile`}>
            <header>
              <strong>Member profile</strong>
              <button type="button" onClick={() => setSelectedProfile(null)} aria-label="Close profile">×</button>
            </header>
            <div className="social-popup-content">
              {profileLoading && <p className="social-muted">Loading profile…</p>}
              {profileError && <p className="social-status" role="alert">{profileError}</p>}
              {!profileLoading && !profileError && (
                <>
                  <div className="social-profile-heading">
                    <span className="social-profile-avatar">{(selectedProfile.full_name || selectedProfile.username || 'R').slice(0, 1).toUpperCase()}</span>
                    <div>
                      <h2>{selectedProfile.full_name || selectedProfile.username}</h2>
                      <p>@{selectedProfile.username}</p>
                      <small className={`social-presence ${selectedProfile.is_online ? 'online' : 'offline'}`}>
                        <span aria-hidden="true" />{selectedProfile.is_online ? 'Online' : 'Offline'}{selectedProfile.role ? ` · ${selectedProfile.role}` : ''}
                      </small>
                    </div>
                  </div>
                  {selectedProfile.position && <p className="social-profile-detail"><strong>Position</strong><span>{selectedProfile.position}</span></p>}
                  <div className="social-profile-stats">
                    <span><strong>{selectedProfile.post_count || 0}</strong> posts</span>
                    <span><strong>{selectedProfile.friend_count || 0}</strong> friends</span>
                  </div>
                  <p className="social-profile-privacy">Contact details are not shown on public profiles.</p>
                  <section className="social-profile-posts" aria-label={`${selectedProfile.full_name || selectedProfile.username}'s posts`}>
                    <h3>Posts</h3>
                    {!selectedProfile.posts?.length && <p className="social-muted">No posts to show.</p>}
                    {selectedProfile.posts?.map(post => (
                      <article className="social-profile-post" key={post.post_id}>
                        <small>{formatDate(post.created_at)} · {post.visibility === 'friends' ? 'Friends' : post.visibility === 'private' ? 'Only me' : 'Public'}</small>
                        {post.repost_of && <p className="social-repost-label">↻ Reposted @{post.original_username || 'member'}</p>}
                        {post.content && <p className="social-post-copy">{post.content}</p>}
                        {(post.product_name || post.product_image) && (
                          <div className="social-product-card">
                            {post.product_image
                              ? <img className="social-product-image" src={post.product_image} alt={post.product_name || 'Product'} />
                              : <div className="social-product-icon">🛍️</div>}
                            <div><strong>{post.product_name || 'Product'}</strong>{post.product_price != null && <span>{Number(post.product_price).toLocaleString()} ETB</span>}</div>
                            {post.product_url && <a href={post.product_url} target="_blank" rel="noreferrer">View product →</a>}
                          </div>
                        )}
                        {post.repost_of && (post.original_content || post.original_product_name) && (
                          <blockquote>
                            {post.original_content}
                            {post.original_product_image && <img className="social-repost-product-image" src={post.original_product_image} alt={post.original_product_name || 'Reposted product'} />}
                            {post.original_product_name && <strong>🛍️ {post.original_product_name}</strong>}
                          </blockquote>
                        )}
                        <div className="social-post-stats"><span>♥ {post.likes} likes</span><span>💬 {post.comments || 0} comments</span><span>↗ {post.shares} shares</span></div>
                      </article>
                    ))}
                  </section>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {activeStory && (
        <div className="social-story-viewer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setActiveStory(null) }}>
          <section className="social-story-dialog" role="dialog" aria-modal="true" aria-label={`${activeStory.full_name || activeStory.username}'s story`}>
            <button type="button" className="social-story-close" onClick={() => setActiveStory(null)} aria-label="Close story">×</button>
            <div className="social-story-cover" style={{ backgroundColor: activeStory.cover_color, backgroundImage: activeStory.image_data ? `linear-gradient(#0002,#0007), url("${activeStory.image_data}")` : 'linear-gradient(145deg, #0001, #0007)' }}>
              <small>{activeStory.full_name || activeStory.username} · {formatDate(activeStory.created_at)}</small>
              <p>{activeStory.body}</p>
            </div>
            <div className="social-story-actions">
              <button type="button" className={activeStory.liked ? 'selected' : ''} onClick={() => likeStory(activeStory)}>{activeStory.liked ? '♥ Liked' : '♡ Like'} · {activeStory.likes}</button>
              <button type="button" onClick={() => shareStory(activeStory)}>↗ Share · {activeStory.shares}</button>
              <a className="social-share-link" href={activeStoryShareLinks.whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => trackStoryShare(activeStory).catch(shareError => setError(shareError.message || 'Could not share this story.'))}>WhatsApp</a>
              <a className="social-share-link" href={activeStoryShareLinks.telegram} target="_blank" rel="noopener noreferrer" onClick={() => trackStoryShare(activeStory).catch(shareError => setError(shareError.message || 'Could not share this story.'))}>Telegram</a>
            </div>
            <div className="social-story-comments">
              {storyComments.map(comment => <p key={comment.comment_id}><strong>{comment.full_name || comment.username}</strong> {comment.body}</p>)}
              {!storyComments.length && <small>No comments yet.</small>}
              <form className="social-comment-form" onSubmit={addStoryComment}>
                <input value={storyComment} maxLength={1000} onChange={event => setStoryComment(event.target.value)} placeholder="Reply to story…" aria-label="Reply to story" required />
                <button type="submit">Send</button>
              </form>
            </div>
          </section>
        </div>
      )}
    </main>
    </>
  )
}

export default Feed
