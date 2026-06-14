# Privacy Policy

## 1. Data We Collect
The Bot stores the following data in a local JSON file (`data.json`):

| Data | Purpose |
|------|---------|
| Discord user ID, username, display name | User identification and role management |
| Role level, XP, message stats | Activity tracking and permission system |
| Language preference (`en`/`id`) | Localization |
| AFK status and reason | AFK feature |
| Command aliases | Custom command aliases |
| AI model, temperature, system prompt | AI chat configuration |
| Auto-translate rules (channel, users, target language) | Auto-translate feature |

The following are held in memory only and reset on restart:
- Blocked user list
- Command prefixes
- AI conversation history
- Active reminder timers

## 2. How We Collect Data
Data is collected automatically when you use the Bot's features (e.g., setting AFK, changing language, configuring aliases, using AI chat).

## 3. Data Sharing
We do not share, sell, or disclose your data to third parties. All data is stored locally on the host machine.

## 4. Data Retention
Data is retained until you request deletion or the Bot is shut down. In-memory data (block list, prefixes, chat history, reminders) is cleared on restart.

## 5. Your Rights
You may request deletion of your stored data by contacting us (see Section 7). The Bot operator can manually remove your data from `data.json`.

## 6. Changes
This policy may be updated. Continued use after changes constitutes acceptance.

## 7. Contact
Open an issue at https://github.com/ginkohub/mushi-dc
