# Color Palette

> Детальная цветовая палитра проекта SoloLevelingV2

---

## Основная палитра

### Фон

```typescript
// Темные фоновые цвета
Colors.background = {
  primary: '#0a0c10',      // Основной фон приложения
  secondary: '#0f1419',    // Дополнительный темный
  tertiary: '#1a1f2e',     // Вторичные элементы
  overlay: '#000000DD',    // Затемнение для модалов (87% opacity)
}
```

### Текст

```typescript
// Только белые оттенки
Colors.text = {
  primary: '#ffffff',      // Основной белый текст
  secondary: 'rgba(255, 255, 255, 0.5)',  // muted-foreground (50%)
  disabled: '#555B6E',     // Серый для disabled
}
```

### Границы и рамки

```typescript
Colors.border = {
  primary: 'rgba(255, 255, 255, 0.2)',    // border-white
  input: 'rgba(255, 255, 255, 0.1)',      // input borders
  ring: 'rgba(255, 255, 255, 0.3)',       // focus ring
  subtle: 'rgba(255, 255, 255, 0.05)',    // едва заметные границы
}
```

### Полупрозрачные фоны

```typescript
Colors.surfaces = {
  panel: 'rgba(26, 31, 46, 0.6)',         // Панели (60%)
  popover: 'rgba(15, 20, 25, 0.95)',      // Всплывающие окна (95%)
  sidebar: 'rgba(15, 20, 25, 0.9)',       // Боковая панель (90%)
  input: 'rgba(26, 31, 46, 0.4)',         // Фон полей ввода (40%)
  muted: 'rgba(255, 255, 255, 0.1)',      // Приглушенный фон
  accent: 'rgba(255, 255, 255, 0.15)',    // Акцентный фон
  switch: 'rgba(255, 255, 255, 0.2)',     // Фон переключателей
}
```

### Эффекты свечения

```typescript
Colors.glow = {
  subtle: 'rgba(255, 255, 255, 0.15)',    // Тонкое свечение (15%)
  text: 'rgba(255, 255, 255, 0.3)',       // Свечение текста (30%)
  default: '0 0 8px rgba(255, 255, 255, 0.15)',
  hover: '0 0 12px rgba(255, 255, 255, 0.25)',
}
```

---

## Цвета для типов активности

### Физическая активность

```typescript
Colors.physical = {
  main: '#00d4ff',                         // Cyan/Blue
  glow: 'rgba(0, 212, 255, 0.5)',
}
```

### Эмоциональная активность

```typescript
Colors.emotional = {
  main: '#ec4899',                         // Pink
  glow: 'rgba(236, 72, 153, 0.5)',
}
```

### Интеллектуальная активность

```typescript
Colors.intellectual = {
  main: '#a855f7',                         // Purple
  glow: 'rgba(168, 85, 247, 0.5)',
}
```

---

## Специальные цвета

### Destructive (деструктивные действия)

```typescript
Colors.destructive = {
  main: '#ef4444',                         // Красный
  glow: 'rgba(239, 68, 68, 0.5)',
}
```

---

## Цвета для графиков

```typescript
// Градиент белого для визуализаций
Colors.chart = {
  1: 'rgba(255, 255, 255, 0.8)',
  2: 'rgba(255, 255, 255, 0.6)',
  3: 'rgba(255, 255, 255, 0.4)',
  4: 'rgba(255, 255, 255, 0.3)',
  5: 'rgba(255, 255, 255, 0.2)',
}
```

---

## Примеры использования

### Панель

```typescript
// ✅ Стандартная панель
<div style={{
  backgroundColor: Colors.surfaces.panel,
  borderColor: Colors.border.primary,
  color: Colors.text.primary,
  boxShadow: Colors.glow.default,
}}>
```

### Кнопка

```typescript
// ✅ Стандартная кнопка
<button style={{
  border: `1px solid ${Colors.border.primary}`,
  background: 'transparent',
  color: Colors.text.primary,
  boxShadow: Colors.glow.default,
}}>
```

### Input

```typescript
// ✅ Поле ввода
<input style={{
  backgroundColor: Colors.surfaces.input,
  borderColor: Colors.border.input,
  color: Colors.text.primary,
}} />

// ✅ Focus
<input style={{
  borderColor: Colors.border.ring,
  boxShadow: `0 0 0 3px ${Colors.border.input}`,
}} />
```

### Progress Bar

```typescript
// ✅ Контейнер прогресс-бара
<div style={{
  background: 'rgba(255, 255, 255, 0.2)',  // primary/20
  height: '8px',
  borderRadius: '9999px',
}}>
  {/* Индикатор */}
  <div style={{
    background: Colors.text.primary,
    height: '100%',
    width: `${progress}%`,
  }} />
</div>
```

### Tabs

```typescript
// ✅ TabsList
<div style={{
  backgroundColor: Colors.surfaces.muted,
  borderRadius: '0.75rem',
  padding: '3px',
}}>

// ✅ Активная вкладка
<button style={{
  backgroundColor: Colors.surfaces.panel,
  color: Colors.text.primary,
  border: `1px solid ${Colors.border.input}`,
}}>

// ✅ Неактивная вкладка
<button style={{
  color: Colors.text.secondary,
  border: '1px solid transparent',
}}>
```

---

## Правила использования

### ✅ ВСЕГДА используй

- Только белые оттенки для основного UI
- Полупрозрачные фоны для панелей
- Легкое свечение (rgba с низкой прозрачностью)
- Темный фон (#0a0c10)

### ❌ НИКОГДА не используй

- Яркие цвета в постоянных элементах UI
- Полностью непрозрачные панели (кроме модалов)
- Цветные границы на обычных элементах
- Градиенты с яркими цветами

### ⚠️ Цвета активности

Используй цвета физической/эмоциональной/интеллектуальной активности ТОЛЬКО в:
- Специальных индикаторах типа активности
- Диаграммах и графиках
- Иконках типов активности

НЕ используй для:
- Обычных кнопок
- Карточек
- Постоянных элементов навигации

---

## Доступность

### Контрастность

Все цвета выбраны с учетом WCAG AA/AAA:

```typescript
// ✅ AAA контраст
white (#ffffff) на #0a0c10

// ✅ AA+ контраст
rgba(255, 255, 255, 0.5) на #0a0c10

// ✅ AA контраст
#ec4899, #a855f7, #00d4ff на #0a0c10
```

---

_Строго следуй этой палитре для обеспечения визуальной консистентности проекта._
