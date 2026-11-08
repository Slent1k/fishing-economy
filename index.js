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
        .setName('top')
        .setDescription('Посмотреть топ-10 самых успешных рыбаков'),
    
    new SlashCommandBuilder()
        .setName('add_fish')
        .setDescription('Начислить рыбки участнику (для модераторов)')
        .addUserOption(option => 
            option.setName('user').setDescription('Кому начисляем').setRequired(true))
        .addIntegerOption(option => 
            option.setName('amount').setDescription('Количество рыбок').setRequired(true))
        .addStringOption(option => 
            option.setName('reason').setDescription('Причина (сдал квест, турнир и т.д.)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('remove_fish')
        .setDescription('Забрать рыбки у участника (для модераторов)')
        .addUserOption(option => 
            option.setName('user').setDescription('У кого забираем').setRequired(true))
        .addIntegerOption(option => 
            option.setName('amount').setDescription('Количество рыбок').setRequired(true))
        .addStringOption(option => 
            option.setName('reason').setDescription('Причина (штраф, нарушение и т.д.)').setRequired(true))
].map(command => command.toJSON());

client.once(Events.ClientReady, async (c) => {
    console.log(`Economy bot started as ${c.user.tag}`);

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

    // Команда /balance
    if (interaction.commandName === 'balance') {
        const userBalance = balances[userId] || 0;
        await interaction.reply({
            content: `🎣 Твой текущий баланс: **${userBalance} рыбок**. Участвуй в турнирах и выполняй квесты, чтобы заработать больше!`,
            ephemeral: true
        });
    }

    // Команда /top
    if (interaction.commandName === 'top') {
        const sorted = Object.entries(balances)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);

        if (sorted.length === 0) {
            return interaction.reply({ content: '🎣 Список лидеров пока пуст!', ephemeral: true });
        }

        const medals = ['🥇', '🥈', '🥉'];
        const leaderboardText = sorted.map(([id, amount], index) => {
            const prefix = medals[index] || `**#${index + 1}**`;
            return `${prefix} <@${id}> — **${amount}** рыбок`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('🏆 Таблица лидеров «Рыбного Хозяйства»')
            .setColor(0xF1C40F)
            .setDescription(leaderboardText)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // Команда /add_fish
    if (interaction.commandName === 'add_fish') {
        if (!interaction.member.permissions.has('ManageRoles')) {
            return interaction.reply({ content: '❌ У тебя нет прав на выдачу рыбок!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason');

        if (!balances[targetUser.id]) balances[targetUser.id] = 0;
        balances[targetUser.id] += amount;
        saveBalances(balances);

        // Отправка ЛС пользователю
        let dmStatus = ' (сообщение в ЛС отправлено)';
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('🎣 Вам начислены рыбки!')
                .setColor(0x2ECC71)
                .addFields(
                    { name: 'Количество', value: `+${amount} рыбок`, inline: true },
                    { name: 'Причина', value: `${reason}`, inline: true },
                    { name: 'Новый баланс', value: `${balances[targetUser.id]} рыбок`, inline: true },
                    { name: 'Выдал', value: `${interaction.user.tag}` }
                )
                .setTimestamp();

            await targetUser.send({ embeds: [dmEmbed] });
        } catch (err) {
            dmStatus = ' (не удалось отправить ЛС — у пользователя закрыт личный чат)';
        }

        // Ответ в канал
        const embed = new EmbedBuilder()
            .setTitle('🎣 Начисление рыбок')
            .setColor(0x00AE86)
            .addFields(
                { name: 'Пользователь', value: `${targetUser}`, inline: true },
                { name: 'Начислено', value: `+${amount} рыбок`, inline: true },
                { name: 'Баланс', value: `${balances[targetUser.id]} рыбок`, inline: true },
                { name: 'Причина / Модератор', value: `${reason} (выдал: ${interaction.user})` }
            )
            .setFooter({ text: `Статус ЛС: ${dmStatus}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // Команда /remove_fish
    if (interaction.commandName === 'remove_fish') {
        if (!interaction.member.permissions.has('ManageRoles')) {
            return interaction.reply({ content: '❌ У тебя нет прав на списание рыбок!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason');

        if (!balances[targetUser.id]) balances[targetUser.id] = 0;
        balances[targetUser.id] = Math.max(0, balances[targetUser.id] - amount);
        saveBalances(balances);

        // Отправка ЛС пользователю
        let dmStatus = ' (сообщение в ЛС отправлено)';
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('⚠️ У вас списаны рыбки')
                .setColor(0xE74C3C)
                .addFields(
                    { name: 'Количество', value: `-${amount} рыбок`, inline: true },
                    { name: 'Причина', value: `${reason}`, inline: true },
                    { name: 'Новый баланс', value: `${balances[targetUser.id]} рыбок`, inline: true },
                    { name: 'Списал', value: `${interaction.user.tag}` }
                )
                .setTimestamp();

            await targetUser.send({ embeds: [dmEmbed] });
        } catch (err) {
            dmStatus = ' (не удалось отправить ЛС — у пользователя закрыт личный чат)';
        }

        // Ответ в канал
        const embed = new EmbedBuilder()
            .setTitle('🗑️ Списание рыбок')
            .setColor(0xE74C3C)
            .addFields(
                { name: 'Пользователь', value: `${targetUser}`, inline: true },
                { name: 'Списано', value: `-${amount} рыбок`, inline: true },
                { name: 'Баланс', value: `${balances[targetUser.id]} рыбок`, inline: true },
                { name: 'Причина / Модератор', value: `${reason} (снял: ${interaction.user})` }
            )
            .setFooter({ text: `Статус ЛС: ${dmStatus}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
});

client.login(TOKEN);