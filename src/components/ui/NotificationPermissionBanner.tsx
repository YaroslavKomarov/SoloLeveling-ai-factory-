'use client'

/**
 * NotificationPermissionBanner
 * Shows a slim banner prompting the user to enable Web Push notifications.
 * Appears when: browser supports Push, permission is 'default', and user hasn't dismissed.
 */
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createLogger } from '@/lib/logger'

const logger = createLogger('NotificationPermissionBanner')

const DISMISSED_KEY = 'push-dismissed'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false)
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    // Check browser support + permission state + dismissed flag
    const supported = 'PushManager' in window && 'serviceWorker' in navigator
    const dismissed = localStorage.getItem(DISMISSED_KEY) === '1'
    const notAsked = Notification.permission === 'default'

    logger.debug('NotificationPermissionBanner — checking visibility', {
      supported,
      dismissed,
      permission: Notification.permission,
    })

    if (supported && !dismissed && notAsked) {
      setVisible(true)
    }
  }, [])

  async function handleEnable() {
    logger.debug('NotificationPermissionBanner — requesting permission')
    setSubscribing(true)

    try {
      const permission = await Notification.requestPermission()
      logger.debug('NotificationPermissionBanner — permission result', { permission })

      if (permission !== 'granted') {
        logger.info('NotificationPermissionBanner — permission denied by user')
        dismiss()
        return
      }

      const registration = await navigator.serviceWorker.ready
      logger.debug('NotificationPermissionBanner — service worker ready, subscribing to push')

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidPublicKey) {
        logger.warn('NotificationPermissionBanner — VAPID public key not set, skipping subscription')
        dismiss()
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      logger.debug('NotificationPermissionBanner — push subscription created', {
        endpoint: subscription.endpoint.slice(0, 60) + '...',
      })

      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
            auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
          },
        }),
      })

      if (!response.ok) {
        logger.error('NotificationPermissionBanner — failed to save subscription', {
          status: response.status,
        })
      } else {
        logger.info('NotificationPermissionBanner — push subscription saved successfully')
      }

      dismiss()
    } catch (err) {
      logger.error('NotificationPermissionBanner — subscribe error', {
        error: err instanceof Error ? err.message : String(err),
      })
      dismiss()
    } finally {
      setSubscribing(false)
    }
  }

  function dismiss() {
    logger.debug('NotificationPermissionBanner — dismissed')
    localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      style={{
        backgroundColor: '#0f1117',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-cinzel)',
          fontSize: '11px',
          letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.7)',
          margin: 0,
          textTransform: 'uppercase',
        }}
      >
        Enable push alerts — receive your daily mission briefing at midnight
      </p>

      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={handleEnable}
          disabled={subscribing}
          style={{
            fontFamily: 'var(--font-cinzel)',
            fontSize: '10px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            backgroundColor: 'transparent',
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,0.4)',
            padding: '4px 12px',
            cursor: subscribing ? 'wait' : 'pointer',
            opacity: subscribing ? 0.6 : 1,
          }}
        >
          {subscribing ? 'Enabling...' : 'Enable'}
        </button>

        <button
          onClick={dismiss}
          aria-label="Dismiss notification banner"
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
