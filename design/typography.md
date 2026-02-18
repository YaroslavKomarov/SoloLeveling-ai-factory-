# Typography

> Типографика и правила работы со шрифтами

---

## Шрифты

### Семейства шрифтов

**Заголовки (Headings):**
```typescript
// ✅ Cinzel - готический, элегантный
fontFamily: {
  heading: 'Cinzel-Regular',
}
```

**Основной текст (Body):**
```typescript
// ✅ Rajdhani Light - технологичный, киберпанк, читаемый
fontFamily: {
  body: 'Rajdhani-Light',
  bodyMedium: 'Rajdhani-Regular', // Для выделения внутри текста
}
```

**Акценты и цифры (Stats, Numbers):**
```typescript
// ✅ Orbitron - технологичный, для числовых показателей
fontFamily: {
  accent: 'Orbitron-Medium',
}
```

### Подключение в Expo

```typescript
// app.config.ts или app.json
{
  "expo": {
    "plugins": [
      [
        "expo-font",
        {
          "fonts": [
            "./assets/fonts/Cinzel-Regular.ttf",
            "./assets/fonts/Rajdhani-Light.ttf",
            "./assets/fonts/Rajdhani-Regular.ttf",
            "./assets/fonts/Orbitron-Medium.ttf"
          ]
        }
      ]
    ]
  }
}
```

---

## Размеры и иерархия

### Шкала размеров
```typescript
// ✅ Стандартная шкала для всего приложения
fontSize: {
  xs: 12,      // Вторичная информация, метки
  sm: 14,      // Обычный текст, описания
  base: 16,    // Основной текст
  lg: 18,      // Крупный текст, акценты
  xl: 20,      // Подзаголовки
  '2xl': 24,   // Заголовки H3
  '3xl': 30,   // Заголовки H2
  '4xl': 36,   // Заголовки H1
  '5xl': 48,   // Hero заголовки (экраны поздравлений)
}
```

### Иерархия текста

**H1 - Главные заголовки (название цели, экраны поздравлений):**
```typescript
{
  fontFamily: 'Cinzel-Regular',
  fontSize: 36,
  color: '#FFFFFF',
  textShadowColor: '#FFFFFF',
  textShadowRadius: 12,
  textShadowOpacity: 0.8,
  letterSpacing: 2,
}
```

**H2 - Подзаголовки (названия секций):**
```typescript
{
  fontFamily: 'Cinzel-Regular',
  fontSize: 30,
  color: '#FFFFFF',
  textShadowColor: '#FFFFFF',
  textShadowRadius: 10,
  textShadowOpacity: 0.6,
  letterSpacing: 1.5,
}
```

**H3 - Мелкие заголовки (названия карточек, модалов):**
```typescript
{
  fontFamily: 'Cinzel-Regular',
  fontSize: 24,
  color: '#FFFFFF',
  textShadowColor: '#FFFFFF',
  textShadowRadius: 8,
  textShadowOpacity: 0.4,
  letterSpacing: 1,
}
```

**Body - Основной текст:**
```typescript
{
  fontFamily: 'Rajdhani-Light',
  fontSize: 16,
  color: '#FFFFFF',
  textShadowColor: '#FFFFFF',
  textShadowRadius: 4,
  textShadowOpacity: 0.2,
  letterSpacing: 0.5,
  lineHeight: 24,
}
```

**Body Medium - Выделение в тексте:**
```typescript
{
  fontFamily: 'Rajdhani-Regular', // НЕ bold, а Regular
  fontSize: 16,
  color: '#FFFFFF',
  textShadowColor: '#FFFFFF',
  textShadowRadius: 6,
  textShadowOpacity: 0.3,
}
```

**Caption - Вторичный текст (метки, подписи):**
```typescript
{
  fontFamily: 'Rajdhani-Light',
  fontSize: 14,
  color: '#B8C5D6', // Приглушенный
  textShadowColor: '#B8C5D6',
  textShadowRadius: 2,
  textShadowOpacity: 0.1,
  letterSpacing: 0.3,
}
```

**Stats - Числовые показатели (уровень, XP, опыт):**
```typescript
{
  fontFamily: 'Orbitron-Medium',
  fontSize: 20,
  color: '#00D9FF', // Акцентный голубой
  textShadowColor: '#00D9FF',
  textShadowRadius: 8,
  textShadowOpacity: 0.6,
  letterSpacing: 1,
}
```

---

## Подсветка текста (Text Glow)

### Правила подсветки

**Заголовки:**
- Сильная подсветка (shadowOpacity: 0.6-0.8, shadowRadius: 8-12)
- Белый цвет подсветки

**Основной текст:**
- Легкая подсветка (shadowOpacity: 0.2-0.3, shadowRadius: 4-6)
- Белый цвет подсветки

**Акцентный текст (успех, ошибка, предупреждение):**
- Подсветка в цвет текста (зеленый, красный, оранжевый)
- Средняя-сильная интенсивность (shadowOpacity: 0.4-0.6)

```typescript
// ✅ Пример подсветки для успеха
<Text style={{
  fontFamily: 'Rajdhani-Regular',
  fontSize: 16,
  color: '#00FF88',
  textShadowColor: '#00FF88',
  textShadowRadius: 6,
  textShadowOpacity: 0.6,
}}>
  Задание выполнено
</Text>
```

---

## Расстояния и выравнивание

### Line Height
```typescript
// ✅ Множитель для высоты строки
lineHeight: {
  tight: fontSize * 1.2,   // Заголовки
  normal: fontSize * 1.5,  // Основной текст
  relaxed: fontSize * 1.8, // Длинные тексты
}
```

### Letter Spacing
```typescript
// ✅ Межбуквенное расстояние
letterSpacing: {
  tight: -0.5,   // Только если нужно сжать (редко)
  normal: 0.5,   // Обычный текст
  wide: 1,       // Подзаголовки
  wider: 1.5,    // Заголовки H2
  widest: 2,     // Заголовки H1
}
```

---

## Состояния текста

### Disabled
```typescript
// ✅ Затухший текст (нет подсветки)
{
  color: '#4A5568',
  opacity: 0.4,
  // БЕЗ textShadow
}
```

### Active/Focused
```typescript
// ✅ Усиленная подсветка
{
  color: '#FFFFFF',
  textShadowColor: '#FFFFFF',
  textShadowRadius: 8,  // Увеличено
  textShadowOpacity: 0.6, // Увеличено
}
```

---

## Примеры компонентов

### Название цели (Goal Title)
```typescript
<Text style={{
  fontFamily: 'Cinzel-Regular',
  fontSize: 30,
  color: '#FFFFFF',
  textShadowColor: '#FFFFFF',
  textShadowRadius: 10,
  textShadowOpacity: 0.6,
  letterSpacing: 1.5,
  textAlign: 'center',
}}>
  Изучить Python
</Text>
```

### XP Counter
```typescript
<Text style={{
  fontFamily: 'Orbitron-Medium',
  fontSize: 18,
  color: '#00D9FF',
  textShadowColor: '#00D9FF',
  textShadowRadius: 8,
  textShadowOpacity: 0.6,
  letterSpacing: 1,
}}>
  1250 / 2000 XP
</Text>
```

### Кнопка
```typescript
<Text style={{
  fontFamily: 'Rajdhani-Regular',
  fontSize: 16,
  color: '#FFFFFF',
  textShadowColor: '#FFFFFF',
  textShadowRadius: 4,
  textShadowOpacity: 0.3,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
}}>
  Начать задание
</Text>
```

### Описание задания
```typescript
<Text style={{
  fontFamily: 'Rajdhani-Light',
  fontSize: 16,
  color: '#FFFFFF',
  textShadowColor: '#FFFFFF',
  textShadowRadius: 4,
  textShadowOpacity: 0.2,
  letterSpacing: 0.5,
  lineHeight: 24,
}}>
  Выполните 20 минут практики с кодом...
</Text>
```

---

## Ограничения

### ❌ НЕ используй
- **Bold/Extra Bold варианты** - только Light/Regular/Medium
- **Italic** - НЕ подходит для готического стиля
- **Декоративные шрифты** - только 3 семейства
- **Смешение семейств в одном элементе** - одна строка = один шрифт

### ✅ Используй
- Размер и подсветку для иерархии
- Letter spacing для акцентов
- Цвет для семантики (зеленый/красный/оранжевый)

---

_Всегда соблюдай иерархию и подсветку. Шрифт = основа атмосферы._
