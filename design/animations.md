# Animations

> Правила анимаций и фоновых эффектов для SoloLevelingV2

---

## Философия анимаций

### Принципы
- **Максимальная плавность** - все переходы smooth и ненавязчивые
- **Сдержанность** - анимации почти незаметны
- **Минимализм** - только необходимые анимации
- **Белое свечение** - никаких цветных эффектов (кроме специальных случаев)

### Длительность

```typescript
const duration = {
  fast: 200,      // Hover эффекты
  normal: 300,    // Модалы, карточки
  slow: 400,      // Переходы между страницами
  xslow: 20000,   // Фоновые анимации
}
```

### Easing

```typescript
const easing = {
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',  // Плавный
  page: 'cubic-bezier(0.25, 0.1, 0.25, 1)', // Для переходов страниц
}
```

---

## Фоновая анимация (AnimatedBackground)

### Описание

Фон состоит из двух слоев:
1. **Статическая сетка** — тонкие линии, образующие квадраты 50x50px
2. **Анимированные частицы** — 50 белых точек, движущихся медленно и соединяющихся линиями при сближении

### Параметры сетки

```javascript
ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';  // Очень тонкие линии (3% белого)
ctx.lineWidth = 1;
const gridSize = 50;  // Размер квадратов сетки в пикселях
```

### Параметры частиц

```javascript
const particleCount = 50;  // Количество частиц

// Свойства каждой частицы:
{
  vx: (Math.random() - 0.5) * 0.5,  // Скорость по X (очень медленная)
  vy: (Math.random() - 0.5) * 0.5,  // Скорость по Y (очень медленная)
  size: Math.random() * 2 + 1,      // Размер от 1 до 3 пикселей
  opacity: Math.random() * 0.5 + 0.2, // Прозрачность от 0.2 до 0.7
}

// Отрисовка частиц:
ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity * 0.6})`;
```

### Соединительные линии

```javascript
// Линии рисуются между частицами, находящимися ближе 150px друг к другу
if (distance < 150) {
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * (1 - distance / 150)})`;
  ctx.lineWidth = 1;
}
// Прозрачность линии зависит от расстояния
```

### Применение фона

```jsx
<canvas
  className="fixed inset-0 pointer-events-none opacity-30"
  style={{ zIndex: 0 }}
/>
```

**ВАЖНО:** фон имеет `opacity: 30%`, `z-index: 0` и `pointer-events-none`

### Полная реализация

```typescript
'use client'

import { useEffect, useRef } from 'react'

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Установка размеров
    const setCanvasSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    setCanvasSize()

    // Параметры
    const gridSize = 50
    const particleCount = 50
    const maxDistance = 150
    const baseSpeed = 0.5

    // Создание частиц
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * baseSpeed,
      vy: (Math.random() - 0.5) * baseSpeed,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.2,
    }))

    let animationId: number

    function animate() {
      if (!canvas || !ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Отрисовка сетки
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
      ctx.lineWidth = 1

      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }

      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      // Обновление позиций частиц
      particles.forEach(particle => {
        particle.x += particle.vx
        particle.y += particle.vy

        // Отражение от границ
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1
      })

      // Отрисовка связей между частицами
      particles.forEach((particleA, i) => {
        particles.slice(i + 1).forEach(particleB => {
          const dx = particleA.x - particleB.x
          const dy = particleA.y - particleB.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < maxDistance) {
            const opacity = 0.15 * (1 - distance / maxDistance)
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(particleA.x, particleA.y)
            ctx.lineTo(particleB.x, particleB.y)
            ctx.stroke()
          }
        })
      })

      // Отрисовка частиц
      particles.forEach(particle => {
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity * 0.6})`
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    // Resize handler
    window.addEventListener('resize', setCanvasSize)

    return () => {
      window.removeEventListener('resize', setCanvasSize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none opacity-30"
      style={{ zIndex: 0 }}
    />
  )
}
```

---

## Motion/React (Framer Motion) анимации

### Появление экрана (fade-in + scale)

```jsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 1.2, ease: 'easeOut' }}
/>
```

### Появление элемента сверху

```jsx
<motion.div
  initial={{ opacity: 0, y: -20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.1 }}
/>
```

### Появление элемента слева

```jsx
<motion.div
  initial={{ opacity: 0, x: -50 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ delay: 0.1 }}
/>
```

### Пульсирующая анимация

```jsx
<motion.div
  animate={{
    scale: [1, 1.1, 1],
    opacity: [0.3, 0.5, 0.3],
  }}
  transition={{
    duration: 2,
    repeat: Infinity,
    ease: "easeInOut"
  }}
/>
```

### Анимация кнопки при hover и tap

```jsx
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ duration: 0.2 }}
/>
```

### Плавное перемещение индикатора активной вкладки

```jsx
<motion.div
  layoutId="activeTab"
  className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/50"
  transition={{ type: "spring", stiffness: 380, damping: 30 }}
/>
```

---

## Переходы между страницами

### Slide transition (горизонтальный сдвиг)

```typescript
'use client'

import { motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <motion.div
      key={pathname}
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -20, opacity: 0 }}
      transition={{
        duration: 0.4,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      {children}
    </motion.div>
  )
}
```

**Параметры:**
- Направление: горизонтальный сдвиг (x-axis)
- Длительность: 400ms
- Easing: cubic-bezier(0.25, 0.1, 0.25, 1)
- Opacity fade: 0 → 1 при входе

---

## Модальные окна и диалоги

### Overlay анимация

```jsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 bg-black/50"
/>
```

### Dialog Content анимация

```jsx
<motion.div
  initial={{ scale: 0.8, opacity: 0, y: 50 }}
  animate={{ scale: 1, opacity: 1, y: 0 }}
  exit={{ scale: 0.8, opacity: 0, y: 50 }}
  transition={{ type: 'spring', damping: 20, stiffness: 300 }}
  className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
>
```

---

## Специальные анимации

### Skeleton Loading

```jsx
<motion.div
  animate={{
    opacity: [0.3, 0.6, 0.3],
  }}
  transition={{
    duration: 1.5,
    repeat: Infinity,
    ease: 'easeInOut',
  }}
  className="bg-white/20 h-10"
/>
```

### Notification Slide In

```jsx
<motion.div
  initial={{ y: 100, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  exit={{ y: 100, opacity: 0 }}
  transition={{ type: 'spring', damping: 15 }}
  className="fixed bottom-4"
>
```

---

## Микро-анимации

### Icon Pulse при действии

```jsx
<motion.div
  animate={{ scale: [1, 1.2, 1] }}
  transition={{ duration: 0.3 }}
>
  <Icon />
</motion.div>
```

### Glow Pulse для привлечения внимания

```jsx
<motion.div
  animate={{
    boxShadow: [
      '0 0 8px rgba(255, 255, 255, 0.15)',
      '0 0 16px rgba(255, 255, 255, 0.4)',
      '0 0 8px rgba(255, 255, 255, 0.15)',
    ],
  }}
  transition={{
    duration: 2,
    repeat: Infinity,
    ease: 'easeInOut',
  }}
>
```

---

## Правила анимаций

### ✅ ИСПОЛЬЗУЙ

- Плавные easing функции (bezier curves)
- Loop для фоновых анимаций
- Spring для интерактивных элементов (естественнее)
- Короткие длительности для UI (150-400ms)
- Длинные для фона (10-15 секунд)

### ❌ ИЗБЕГАЙ

- Резких переходов (linear easing для UI)
- Слишком быстрых анимаций (<100ms)
- Слишком интенсивных эффектов (отвлекают)
- Бесконечных loop для UI-элементов (только фон)
- Анимаций без смысла

---

## Performance

### Оптимизация

- Используй Canvas API для фоновых анимаций
- requestAnimationFrame для smooth анимаций
- Limit количество одновременных анимаций (максимум 50 частиц)
- Reduce opacity фона для сложных анимаций

```typescript
// ✅ Canvas + requestAnimationFrame
function animate() {
  requestAnimationFrame(animate)
  // animation logic
}

// ✅ Используй transform и opacity (GPU-accelerated)
<motion.div
  animate={{ transform: 'translateX(100px)', opacity: 0.5 }}
/>
```

---

_Анимации подчеркивают, но не отвлекают. Плавность и сдержанность._
