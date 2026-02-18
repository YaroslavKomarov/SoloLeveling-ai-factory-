# UI Style Guidelines

> Визуальная философия и правила стилизации для SoloLevelingV2

---

## Дизайн-философия

### Ключевые принципы
- **Темная элегантность** - очень темный фон (#0a0c10) с белыми акцентами
- **Минимализм** - только необходимые элементы, без декоративных излишеств
- **Serif-типографика** - Cinzel для заголовков, Cormorant для текста
- **Полупрозрачность** - слои с различной прозрачностью для создания глубины
- **Тонкое свечение** - белые элементы с едва заметным glow эффектом

### Атмосфера
Глубокое темное пространство с элегантными белыми элементами. Динамический граф на заднем фоне создает ощущение живой системы. Минимальное количество цветных акцентов - только для критических состояний.

---

## Цветовая палитра

### Основные цвета

```typescript
// ✅ Фон
--darker-navy: #0a0c10        // Основной фон
--dark-navy: #0f1419          // Дополнительный темный
--deep-blue: #1a1f2e          // Вторичные элементы

// ✅ Полупрозрачные панели
--panel-bg: rgba(26, 31, 46, 0.6)
--popover: rgba(15, 20, 25, 0.95)
--sidebar: rgba(15, 20, 25, 0.9)
--input-background: rgba(26, 31, 46, 0.4)

// ✅ Текст
--foreground: #ffffff         // Основной белый
--primary: #ffffff            // Акценты

// ✅ Границы
--border-white: rgba(255, 255, 255, 0.2)
--input: rgba(255, 255, 255, 0.1)
--ring: rgba(255, 255, 255, 0.3)

// ✅ Свечение
--subtle-glow: rgba(255, 255, 255, 0.15)
--text-glow: rgba(255, 255, 255, 0.3)
```

### Цвета для типов активности

```typescript
// Используются ТОЛЬКО в специальных компонентах
--emotional-color: #ec4899     // Pink
--intellectual-color: #a855f7  // Purple
--physical-color: #00d4ff      // Cyan
```

### Специальные цвета

```typescript
--destructive: #ef4444  // Красный для удаления
```

---

## Типографика

### Шрифты

```css
/* Импорт */
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Forum&family=Cormorant:wght@300;400;500;600&display=swap');

/* Использование */
- Cinzel: заголовки, кнопки (готический serif)
- Cormorant: основной текст (классический serif)
- Forum: запасной serif
```

### Базовые настройки

```css
body {
  font-family: 'Cormorant', 'Forum', Georgia, serif;
  font-weight: 300;  /* Легкий вес */
  overflow-x: hidden;
}

html {
  font-size: 16px;
}
```

### Заголовки

```css
h1 {
  font-family: 'Cinzel', serif;
  font-size: 2.5rem;        /* 40px */
  font-weight: 400;
  letter-spacing: 0.15em;   /* Широкий интервал */
  text-transform: uppercase;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
}

h2 {
  font-family: 'Cinzel', serif;
  font-size: 1.75rem;       /* 28px */
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-shadow: 0 0 15px rgba(255, 255, 255, 0.25);
}

h3 {
  font-family: 'Cinzel', serif;
  font-size: 1.25rem;       /* 20px */
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
```

### Остальные элементы

```css
label {
  font-family: 'Cormorant', serif;
  font-size: 1rem;
  font-weight: 400;
  letter-spacing: 0.03em;
}

button {
  font-family: 'Cinzel', serif;
  font-size: 0.875rem;      /* 14px */
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

input, textarea {
  font-family: 'Cormorant', serif;
  font-size: 1rem;
  font-weight: 300;         /* Light */
}
```

---

## Эффекты свечения

### Классы для свечения

```css
.subtle-glow {
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.1),
              0 0 25px rgba(255, 255, 255, 0.05);
}

.text-glow {
  text-shadow: 0 0 15px rgba(255, 255, 255, 0.3),
               0 0 25px rgba(255, 255, 255, 0.15);
}

.border-glow {
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.15),
              inset 0 0 10px rgba(255, 255, 255, 0.05);
}
```

---

## Layout и структура

### Навигация

```typescript
// ✅ Навигация ВСЕГДА вверху
<nav className="fixed top-0 left-0 right-0 border-b z-50">
```

### Основной контейнер

```typescript
// ✅ Отступ сверху для фиксированной навигации
<main className="flex-1 pt-[var(--header-height)]">
```

### z-index слои

```css
z-index: 0     /* AnimatedBackground */
z-index: 10    /* Основной контент */
z-index: 20    /* Header */
z-index: 30    /* Панели */
z-index: 50    /* Диалоги */
z-index: 100   /* Критические оверлеи */
```

---

## Визуальные правила

### ✅ ИСПОЛЬЗУЙ
- Прямоугольные формы (radius: 0 по умолчанию)
- Белые элементы с легким свечением
- Очень темный фон (#0a0c10)
- Динамический граф на заднем фоне
- Serif шрифты (Cinzel, Cormorant)
- Минималистичные иконки (lucide-react)
- Плавные transitions
- Полупрозрачные слои для глубины

### ❌ СТРОГО ЗАПРЕЩЕНО
- Яркие цвета в основном интерфейсе
- Цветные рамки на постоянных элементах
- Эмодзи
- Множественные тени
- Излишний декор
- Навигация внизу экрана

### ⚠️ Скругления (исключения)

```css
--radius: 0;  /* По умолчанию */

/* Исключения: */
rounded-md: 0.375rem;  /* Кнопки, input */
rounded-lg: 0.5rem;    /* Диалоги, карточки */
rounded-xl: 0.75rem;   /* Табы */
rounded-full: 9999px;  /* Круги, progress */
```

---

## Адаптивность

### Breakpoints

```css
sm: 640px   /* Маленькие планшеты */
md: 768px   /* Планшеты */
lg: 1024px  /* Десктопы */
xl: 1280px  /* Большие десктопы */
```

### Типичные адаптивные классы

```jsx
/* Шрифты */
text-xs md:text-sm lg:text-base

/* Отступы */
p-3 md:p-6 lg:p-8

/* Gap */
gap-2 md:gap-4 lg:gap-6
```

---

## Transitions

### Стандартные переходы

```css
/* Универсальный */
transition: all 0.2s ease;

/* Для цветов и теней */
transition: color 0.2s, box-shadow 0.2s;

/* Duration */
duration-200: 200ms   /* Быстро (кнопки, hover) */
duration-300: 300ms   /* Средне (карточки) */
duration-500: 500ms   /* Медленно (модальные окна) */
```

---

## Скроллбар

```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 0;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
```

---

## Важные принципы

### Минимализм
- Тонкие границы (1px)
- Много воздуха (большие отступы)
- Минимум декоративных элементов

### Элегантность
- Готические шрифты с широким letter-spacing
- UPPERCASE для заголовков и кнопок
- Легкие веса шрифтов (300-400)

### Глубина через прозрачность
- Многослойность через различные уровни прозрачности
- backdrop-blur для создания глубины
- Тонкие эффекты свечения

---

_Этот файл является основой для всей визуальной стилизации проекта. При создании новых компонентов всегда проверяй соответствие этим правилам._
