package com.champubot;

import com.mojang.brigadier.arguments.StringArgumentType;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.passive.VillagerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Formatting;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import static net.minecraft.server.command.CommandManager.argument;
import static net.minecraft.server.command.CommandManager.literal;

public class ChampuBotMod implements ModInitializer {
    private static final String NPC_NAME = "Champu";
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    @Override
    public void onInitialize() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> dispatcher.register(literal("champu")
            .then(literal("spawn").executes(context -> {
                ServerPlayerEntity player = context.getSource().getPlayerOrThrow();
                ServerWorld world = context.getSource().getWorld();
                VillagerEntity npc = EntityType.VILLAGER.create(world);
                if (npc == null) return 0;
                npc.refreshPositionAndAngles(player.getX(), player.getY(), player.getZ(), 0, 0);
                npc.setCustomName(Text.literal(NPC_NAME).formatted(Formatting.GOLD, Formatting.BOLD));
                npc.setCustomNameVisible(true);
                npc.setAiDisabled(true);
                world.spawnEntity(npc);
                player.sendMessage(Text.literal("Champu NPC spawned. Use /champu ask <message>"), false);
                return 1;
            }))
            .then(literal("ask").then(argument("message", StringArgumentType.greedyString()).executes(context -> {
                ServerPlayerEntity player = context.getSource().getPlayerOrThrow();
                ask(player, StringArgumentType.getString(context, "message"));
                return 1;
            }))));

        UseEntityCallback.EVENT.register((player, world, hand, entity, hit) -> {
            if (!world.isClient && entity instanceof VillagerEntity villager && NPC_NAME.equals(villager.getCustomName() == null ? "" : villager.getCustomName().getString())) {
                player.sendMessage(Text.literal("Champu: use /champu ask <message>").formatted(Formatting.YELLOW), false);
                return ActionResult.SUCCESS;
            }
            return ActionResult.PASS;
        });
    }

    private static void ask(ServerPlayerEntity player, String message) {
        player.sendMessage(Text.literal("Champu soch raha hai...").formatted(Formatting.GRAY), false);
        String json = "{\"player\":\"" + escape(player.getName().getString()) + "\",\"message\":\"" + escape(message) + "\"}";
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:8000/chat"))
            .timeout(Duration.ofSeconds(50)).header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json)).build();
        HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString()).whenComplete((response, error) -> {
            String reply = error == null ? extractReply(response.body()) : "AI service offline hai. Python server aur Ollama start karo.";
            player.getServer().execute(() -> player.sendMessage(Text.literal("Champu: " + reply).formatted(Formatting.GREEN), false));
        });
    }

    private static String extractReply(String body) {
        String marker = "\"reply\":\"";
        int start = body.indexOf(marker);
        if (start < 0) return "Mujhe reply nahi mila.";
        start += marker.length();
        int end = body.indexOf("\"", start);
        return end < 0 ? "Mujhe reply nahi mila." : body.substring(start, end).replace("\\\"", "\"");
    }

    private static String escape(String value) { return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " "); }
}

