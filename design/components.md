# UI Components

> Детальные правила для UI компонентов SoloLevelingV2

---

## Кнопки (Buttons)

### Стандартная кнопка

```typescript
// ✅ Базовая кнопка
<button
  className="border px-6 py-3 uppercase tracking-wide transition-all hover:shadow-lg"
  style={{
    borderColor: 'rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
    backgroundColor: 'transparent',
    fontFamily: 'Cinzel',
    fontSize: '0.875rem',
    letterSpacing: '0.08em',
    boxShadow: '0 0 8px rgba(255, 255, 255, 0.15)',
  }}
>
```

### Hover состояние

```css
/* При hover усиливается свечение */
hover:shadow-lg
/* boxShadow: '0 0 12px rgba(255, 255, 255, 0.25)' */
```

### Disabled кнопка

```typescript
// ✅ Disabled состояние
<button
  disabled
  className="border px-6 py-3 opacity-40"
  style={{
    borderColor: '#555B6E',
    color: '#555B6E',
    cursor: 'not-allowed',
  }}
>
```

### Размеры кнопок

```css
/* Default */
height: 36px;  /* h-9 */
padding: 0.5rem 1rem;

/* Small */
height: 32px;  /* h-8 */
padding: 0.75rem;

/* Large */
height: 40px;  /* h-10 */
padding: 1.5rem;

/* Icon */
width: 36px;
height: 36px;
padding: 0;
```

### Варианты кнопок

```typescript
// ✅ Outline кнопка
<button style={{
  border: '1px solid rgba(255, 255, 255, 0.2)',
  background: 'transparent',
  color: '#ffffff',
}}>

// ✅ Ghost кнопка
<button style={{
  background: 'transparent',
  color: '#ffffff',
  border: 'none',
}}>
// При hover: background: 'rgba(255, 255, 255, 0.15)'

// ✅ Destructive кнопка
<button style={{
  background: '#ef4444',
  color: '#ffffff',
  border: 'none',
}}>
```

---

## Карточки (Cards)

### Базовая карточка

```typescript
// ✅ Стандартная карточка
<div
  className="border p-6 backdrop-blur-sm"
  style={{
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(26, 31, 46, 0.6)',
    borderRadius: 0,
    boxShadow: '0 0 15px rgba(255, 255, 255, 0.1)',
  }}
>
```

### Hover эффект

```typescript
// ✅ Кликабельная карточка
<div
  className="border p-6 transition-all hover:bg-opacity-80"
  style={{
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(26, 31, 46, 0.6)',
  }}
>
// При hover: backgroundColor: 'rgba(26, 31, 46, 0.8)'
```

---

## Прогресс-бары (Progress Bars)

### Стандартный прогресс-бар

```typescript
// ✅ Контейнер
<div
  className="h-2 w-full rounded-full overflow-hidden"
  style={{
    background: 'rgba(255, 255, 255, 0.2)',
  }}
>
  {/* Индикатор */}
  <div
    className="h-full transition-all duration-300"
    style={{
      width: `${progress}%`,
      background: '#ffffff',
      boxShadow: '0 0 8px rgba(255, 255, 255, 0.4)',
    }}
  />
</div>
```

---

## Поля ввода (Input, Textarea)

### Базовый Input

```typescript
// ✅ Стандартный input
<input
  className="w-full px-3 py-1 border transition-colors"
  style={{
    backgroundColor: 'rgba(26, 31, 46, 0.4)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    borderRadius: '0.375rem',
    height: '36px',
    fontFamily: 'Cormorant',
    fontSize: '1rem',
    fontWeight: 300,
  }}
  placeholder="Введите текст..."
/>
```

### Focus состояние

```typescript
// ✅ Focus styles
<input
  className="focus-visible:ring-[3px]"
  style={{
    // При focus:
    borderColor: 'rgba(255, 255, 255, 0.3)',
    outline: 'none',
    boxShadow: '0 0 0 3px rgba(255, 255, 255, 0.15)',
  }}
/>
```

### Placeholder

```css
::placeholder {
  color: rgba(255, 255, 255, 0.5);
}
```

### Textarea

```typescript
// ✅ Стандартный textarea
<textarea
  className="w-full px-3 py-2 border resize-none"
  style={{
    backgroundColor: 'rgba(26, 31, 46, 0.4)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: '64px',
    borderRadius: '0.375rem',
    fontFamily: 'Cormorant',
  }}
/>
```

---

## Tabs (Вкладки)

### TabsList

```typescript
// ✅ Контейнер вкладок
<div
  className="inline-flex h-9 p-[3px] rounded-xl"
  style={{
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  }}
>
```

### TabsTrigger

```typescript
// ✅ Неактивная вкладка
<button
  className="px-2 py-1 rounded-xl transition-all"
  style={{
    color: 'rgba(255, 255, 255, 0.5)',
    border: '1px solid transparent',
    fontFamily: 'Cinzel',
    fontSize: '0.875rem',
    letterSpacing: '0.08em',
  }}
>

// ✅ Активная вкладка
<button
  className="px-2 py-1 rounded-xl"
  style={{
    backgroundColor: 'rgba(26, 31, 46, 0.6)',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  }}
>
```

---

## Модальные окна (Modals/Dialogs)

### Overlay (затемнение)

```typescript
// ✅ Backdrop
<div
  className="fixed inset-0 z-50"
  style={{
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
  }}
/>
```

### Dialog Content

```typescript
// ✅ Контент модала
<div
  className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 border p-6 backdrop-blur-md"
  style={{
    backgroundColor: 'rgba(15, 20, 25, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '0.5rem',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
    maxWidth: '400px',
    width: '100%',
  }}
>
```

### Анимация появления

```css
/* Radix UI data-state анимации */
data-[state=open]:animate-in
data-[state=closed]:animate-out
data-[state=closed]:fade-out-0
data-[state=open]:fade-in-0
data-[state=closed]:zoom-out-95
data-[state=open]:zoom-in-95
```

---

## Навигация

### Горизонтальная навигация (верх экрана)

```typescript
// ✅ Navigation компонент
<nav
  className="fixed top-0 left-0 right-0 border-b z-50"
  style={{
    backgroundColor: '#0a0c10',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
  }}
>
  <div className="max-w-4xl mx-auto flex">
    {items.map(item => (
      <Link
        className="flex-1 px-6 py-4 border-r last:border-r-0 uppercase tracking-wide text-sm transition-all"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.05)',
          color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
          fontFamily: 'Cinzel',
          backgroundColor: isActive ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
          textShadow: isActive ? '0 0 6px rgba(255, 255, 255, 0.3)' : 'none',
          textAlign: 'center',
        }}
      >
        {item.label}
      </Link>
    ))}
  </div>
</nav>
```

---

## Декоративные элементы

### Угловые акценты

```typescript
// ✅ Top-left corner
<div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-white/30" />

// ✅ Top-right corner
<div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-white/30" />

// ✅ Bottom-left corner
<div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-white/30" />

// ✅ Bottom-right corner
<div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-white/30" />
```

### Многоуровневая рамка

```typescript
// ✅ Основная рамка
<div className="absolute inset-0 border-2 border-white/30 border-glow" />

// ✅ Вторая рамка (отступ 4px)
<div className="absolute inset-[-4px] border border-white/10" />

// ✅ Третья рамка (отступ 8px)
<div className="absolute inset-[-8px] border border-white/5" />
```

---

## Правила для всех компонентов

### ✅ ОБЯЗАТЕЛЬНО

- `borderRadius: 0` по умолчанию (исключения: кнопки, input, tabs)
- Белые элементы с легким свечением
- Полупрозрачные фоны для панелей
- Serif шрифты (Cinzel для заголовков, Cormorant для текста)
- Плавные transitions (200-300ms)

### ❌ СТРОГО ЗАПРЕЩЕНО

- Яркие цвета в основном UI
- Цветные рамки на постоянных элементах
- Эмодзи
- Множественные тени
- Излишний декор

### ⚠️ Используй цвета активности

ТОЛЬКО в специальных индикаторах:
- Иконки типов активности
- Диаграммы и графики
- Специальные badges

НЕ используй для:
- Обычных кнопок
- Карточек
- Навигации

---

_Все компоненты должны следовать этим правилам для обеспечения визуальной консистентности._
