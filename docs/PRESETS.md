# Pixora — пресеты и материалы

Семь AI-пресетов на четырёх основных сетях и отдельный Pixel Art. Названия и финальная обработка собственные; это аналоги назначения, а не точное воспроизведение моделей Upscayl. Лицензии весов разрешают их распространение; provenance и хеши закреплены в manifest-файлах.

| Пресет | Сеть | Подходящий материал |
|---|---|---|
| Стандартный | RealESRGAN_x4plus | [Golden Gate: мост и пейзаж](https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_from_Battery_Spencer.jpg) |
| Лёгкий | realesr-general-x4v3 | [Cliffs of Moher: море и скалы](https://commons.wikimedia.org/wiki/File:Cliffs_of_Moher,County_Clare,_Ireland.jpg) |
| Естественный | RealESRNet_x4plus | [Гонконг: ночные плавные переходы](https://commons.wikimedia.org/wiki/File:Hong-Kong_skyline.JPG) |
| Детали | RealESRGAN_x4plus + USM 0.15 | [Газели: тонкие контуры](https://commons.wikimedia.org/wiki/File:Gazelles_of_Sunset.jpg) |
| Баланс | RealESRGAN_x4plus, AI 80% / источник 20% | [Fronalpstock: растительность и вода](https://commons.wikimedia.org/wiki/File:Fronalpstock_big.jpg) |
| Резкость | RealESRGAN_x4plus + USM 0.35 | [Колизей: архитектура и кладка](https://commons.wikimedia.org/wiki/File:Roman_Colosseum_10.jpg) |
| Иллюстрации | RealESRGAN_x4plus_anime_6B | [Wikipe-tan: контурный рисунок](https://commons.wikimedia.org/wiki/File:Wikipe-tan_full_length.svg) |
| Pixel Art | Nearest-neighbor, без AI | [Изометрический рисунок 31 × 28](https://commons.wikimedia.org/wiki/File:Isometric_Pixel_Art_Sample.png) |

Страницы содержат авторство и лицензии. Эти справочные материалы не включены в APK и не выданы за результат Pixora. В пикере сейчас встроены другие, предоставленные владельцем пары «До/После» из `Downloads/compressed-images (1)` и `Downloads/1–8`. Номера соответствуют строкам таблицы. Их происхождение, исходные и встроенные SHA-256 и размеры закреплены в [manifest](../assets/presets/manifest.json). Подпись «Пример обработки» не означает, что пара получена текущей моделью Pixora.

Каждый AI-пресет: 2×/4× и быстро/качественно. Быстро ограничивает AI-вход 512 px, качественно 1024 px; целевые размеры одинаковы. На входе до 512 px вычисления совпадают. Pixel Art не имеет переключателя скорости. Подробная конфигурация и ограничения — [PRD](PRD.md).

Официальный каталог: [Real-ESRGAN model zoo](https://github.com/xinntao/Real-ESRGAN/blob/master/docs/model_zoo.md). Качество зависит от изображения; универсальная оптимальность не заявляется.
