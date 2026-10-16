# Jak opublikować Actora w Apify Store

Potrzebujesz komputera (Windows, Mac lub Linux) z zainstalowanym Node.js 20+ (https://nodejs.org).

## 1. Wgraj Actora na swoje konto Apify

1. Rozpakuj ZIP i otwórz terminal w folderze `tiktok-actor`.
2. Zainstaluj Apify CLI:
   ```
   npm install -g apify-cli
   ```
3. Zaloguj się. Token API znajdziesz w Apify Console → **Settings → API & Integrations**:
   ```
   apify login
   ```
4. Wyślij kod i zbuduj Actora:
   ```
   apify push
   ```
   CLI sam utworzy Actora na Twoim koncie i wypisze link do niego w Apify Console.

## 2. Przetestuj go przed publikacją

1. W Apify Console otwórz Actora → zakładka **Input**.
2. Zostaw słowo kluczowe `cytaty motywacyjne`, ustaw **Maximum videos in total** na 30.
3. W sekcji **Proxy** wybierz grupę **Residential** i kraj **PL**. Bez proxy domowego TikTok szybko blokuje.
4. Kliknij **Start**. Po zakończeniu sprawdź:
   - zakładkę **Output** (tabela z filmami),
   - **Storage → Key-value store → REPORT** (raport HTML).

Jeśli wyników jest 0 i w logu jest ostrzeżenie o ścianie logowania, wklej w polu **TikTok sessionid cookie** wartość ciasteczka `sessionid` z przeglądarki, w której jesteś zalogowany na TikToku. Użyj do tego konta pomocniczego, nie głównego.

## 3. Opublikuj w Apify Store

1. Apify Console → **Development → My Actors** → wybierz Actora.
2. Zakładka **Publishing**. Uzupełnij wszystkie wymagane sekcje:
   - **Display information**: ikona i krótki opis,
   - **Monetization**: model cenowy (np. płatność za wynik albo za darmo),
   - **Sample output**: przykładowy wynik (możesz wziąć z testowego uruchomienia),
   - **Output schema**,
   - **Actor permissions**: wystarczy poziom ograniczony, Actor zapisuje tylko do własnych magazynów danych.
3. Kliknij **Publish on Store**.
4. Sprawdź w https://apify.com/store, czy strona Actora się pojawiła.

## Ważne

- Opis w README jest po angielsku, bo tak szuka większość klientów w Apify Store. Raport może być po polsku lub angielsku (pole **Report language**).
- Apify automatycznie testuje publiczne Actory na domyślnych ustawieniach. Domyślne wejście musi działać, więc nie usuwaj przykładowego słowa kluczowego.
- TikTok często zmienia stronę. Publiczny Actor wymaga utrzymania; Apify zaleca ok. 2 godziny tygodniowo na poprawki i odpowiedzi użytkownikom.
- Zbieranie danych z TikToka jest niezgodne z jego regulaminem. Odpowiedzialność za sposób użycia danych (np. RODO wobec danych twórców) leży po stronie użytkownika Actora.

## Testy lokalne

```
npm install
npm test
```
Testy sprawdzają mapowanie danych, analizę i raport na prawdziwych statystykach 10 filmów.
