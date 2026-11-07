require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, Events } = require('discord.js');
const express = require('express');
const fs = require('fs');

const TOKEN = process.env.TOKEN;

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('Fishing Economy Bot is alive!'));
app.listen(PORT, () => console.log('Web server started'));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// Файл для хранения балансов рыбок
const DB_FILE = './balances.json';

function loadBalances() {
    if (!fs.existsSync(DB_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveBalances(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Слеш-команды
const commands = [
    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Посмотреть свой баланс рыбок'),
    
    new SlashCommandBuilder()
        .setName('add_fish')
        .setDescription('Начислить рыбки участнику (для модераторов)')
        .addUserOption(option => 
            option.setName('user').setDescription('Кому начисляем').setRequired(true))
        .addIntegerOption(option => 
            option.setName('amount').setDescription('Количество рыбок').setRequired(true))
        .addStringOption(option => 
            option.setName('reason').setDescription('Причина (турнир, приглашение и т.д.)').setRequired(true))
].map(command => command.toJSON());

client.once(Events.ClientReady, async (c) => {
    console.log(`Economy bot started as ${c.user.tag}`);

    // Автоматическая регистрация слеш-команд
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Регистрация слеш-команд...');
        await rest.put(
            Routes.applicationCommands(c.user.id),
            { body: commands },
        );
        console.log('Слеш-команды успешно зарегистрированы!');
    } catch (error) {
        console.error(error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const balances = loadBalances();
    const userId = interaction.user.id;

    if (interaction.commandName === 'balance') {
        const userBalance = balances[userId] || 0;
        await interaction.reply({
            content: `🎣 Твой текущий баланс: **${userBalance} рыбок**. Участвуй в турнирах и приглашай друзей, чтобы заработать больше!`,
            ephemeral: true
        });
    }

    if (interaction.commandName === 'add_fish') {
        if (!interaction.member.permissions.has('ManageRoles')) {
            return interaction.reply({ content: '❌ У тебя нет прав на выдачу рыбок!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason');

        if (!balances[targetUser.id]) {
            balances[targetUser.id] = 0;
        }
        balances[targetUser.id] += amount;
        saveBalances(balances);

        const embed = new EmbedBuilder()
            .setTitle('🎣 Начисление рыбок')
            .setColor(0x00AE86)
            .addFields(
                { name: 'Пользователь', value: `${targetUser}`, inline: true },
                { name: 'Начислено', value: `+${amount} рыбок`, inline: true },
                { name: 'Баланс', value: `${balances[targetUser.id]} рыбок`, inline: true },
                { name: 'Причина / Модератор', value: `${reason} (выдал: ${interaction.user})` }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
});

client.login(TOKEN);