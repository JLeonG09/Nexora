package com.nexora.clients;

import com.nexora.dtos.ai.AiContactDto;
import com.nexora.services.AmountExtractor;
import com.nexora.services.TextNormalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lee un mensaje con reglas fijas: intención, contacto, monto y memo. Sin modelo y sin red, así que es
 * instantáneo y siempre da el mismo resultado para el mismo texto.
 */
public final class RuleInterpreter {

    /** NOT_PAY: habla de dinero que le deben, recibió o ya pagó; nunca se convierte en un pago nuevo. */
    public enum Intent {
        PAY, NOT_PAY, BALANCE, GREETING, HOW_ARE_YOU, WHO_ARE_YOU, HELP, THANKS, FAREWELL, ACKNOWLEDGE, UNKNOWN
    }

    /**
     * EXACT: el nombre completo aparece. PARTIAL: aparece una palabra distintiva del nombre ("Rosa" por "Doña
     * Rosa"). FUZZY: aparece con una letra de diferencia ("Anna"). AMBIGUOUS: encaja con varios contactos.
     * MULTIPLE: se nombran varios contactos distintos.
     */
    public enum ContactMatch { EXACT, PARTIAL, FUZZY, AMBIGUOUS, MULTIPLE, NONE }

    public record Reading(Intent intent, ContactMatch match, List<AiContactDto> contacts,
                          List<AmountExtractor.Token> amounts, String memo) {

        public AiContactDto contact() {
            return contacts.isEmpty() ? null : contacts.get(0);
        }

        public boolean hasClearAmount() {
            return amounts.stream().anyMatch(token -> !token.ambiguous());
        }

        public boolean hasOnlyAmbiguousAmounts() {
            return !amounts.isEmpty() && !hasClearAmount();
        }

        /** El primer número no ambiguo, tal como lo escribió el usuario. */
        public AmountExtractor.Token amount() {
            return amounts.stream().filter(token -> !token.ambiguous()).findFirst().orElse(null);
        }

        public boolean identifiesOneContact() {
            return match == ContactMatch.EXACT || match == ContactMatch.PARTIAL;
        }
    }

    private static final Pattern NOT_PAY = Pattern.compile(
            "\\b(me|nos) (debe|deben|debia|pag|mand|envi|transf|deposit|devolv|abon|gir|sinpe|yape)\\w*"
                    + "|\\b(recib|cobr|devolv)\\w*"
                    + "|\\bya (le |les )?(pag|mand|envi|transf)\\w*");
    private static final Pattern PAY_VERB = Pattern.compile(
            "\\b(pag|mand|envi|transf|deposit|abon|gir|pasa|pase|dale|dele|sinpe|yape)\\w*");
    private static final Pattern BALANCE_WORD = Pattern.compile(
            "\\b(cuanto|saldo|limite|queda|disponible)\\w*");
    /** Solo si es el mensaje entero: "dale" suelto asiente, "dale 10 a Ana" es un pago. */
    private static final Pattern ACKNOWLEDGE_ONLY = Pattern.compile(
            "^(ok|okay|okey|vale|listo|perfecto|genial|excelente|entendido|de acuerdo|dale|bien|super|esta bien"
                    + "|ya|claro|buenisimo)[.!¡ ]*$");
    private static final Pattern HOW_ARE_YOU = Pattern.compile(
            "\\b(como (estas|esta|te va|vas|andas|te encuentras)|que tal|todo bien)\\b");
    private static final Pattern WHO_ARE_YOU = Pattern.compile(
            "\\b(quien eres|que eres|como te llamas|tu nombre|eres (un |una )?(bot|robot|humano|persona|ia))\\b");
    private static final Pattern HELP_WORD = Pattern.compile(
            "\\b(ayuda|ayudame|que puedes|que haces|que sabes|como funciona|como te uso|como se usa)\\b");
    private static final Pattern THANKS_WORD = Pattern.compile(
            "\\b(gracias|te agradezco|grax|thanks)\\b");
    private static final Pattern FAREWELL_WORD = Pattern.compile(
            "\\b(adios|chao|chau|bye|hasta (luego|pronto|manana|la proxima)|nos vemos)\\b");
    private static final Pattern GREETING_WORD = Pattern.compile(
            "\\b(hola|holi|hey|buen[oa]s?|saludos|que onda|pura vida)\\b");
    private static final Pattern MEMO = Pattern.compile("(?i)\\s(?:por|x)\\s+(?!favor\\b)(.+)$");
    /** Palabras de trato que no identifican a nadie por sí solas. */
    private static final Set<String> TITLES = Set.of("don", "dona", "sr", "sra", "senor", "senora", "la", "el",
            "de", "del", "los", "las", "mi", "y");
    private static final int MAX_MEMO = 100;

    private RuleInterpreter() {
    }

    public static Reading read(String message, List<AiContactDto> contacts) {
        String normalized = TextNormalizer.normalize(message);
        List<AiContactDto> known = contacts == null ? List.of() : contacts;
        List<AmountExtractor.Token> amounts = AmountExtractor.extract(message);

        ContactLookup lookup = findContacts(normalized, known);
        return new Reading(intent(normalized), lookup.match(), lookup.contacts(), amounts, memo(message, lookup));
    }

    private static Intent intent(String normalized) {
        // Antes que PAY_VERB: "Ana me pagó 20" tiene verbo de pago pero el dinero va hacia el usuario.
        if (NOT_PAY.matcher(normalized).find()) {
            return Intent.NOT_PAY;
        }
        if (ACKNOWLEDGE_ONLY.matcher(normalized).matches()) {
            return Intent.ACKNOWLEDGE;
        }
        if (PAY_VERB.matcher(normalized).find()) {
            return Intent.PAY;
        }
        if (BALANCE_WORD.matcher(normalized).find()) {
            return Intent.BALANCE;
        }
        // Lo más concreto primero: "hola, ¿cómo estás?" se contesta como "¿cómo estás?" con el saludo delante.
        if (HOW_ARE_YOU.matcher(normalized).find()) {
            return Intent.HOW_ARE_YOU;
        }
        if (WHO_ARE_YOU.matcher(normalized).find()) {
            return Intent.WHO_ARE_YOU;
        }
        if (HELP_WORD.matcher(normalized).find()) {
            return Intent.HELP;
        }
        if (THANKS_WORD.matcher(normalized).find()) {
            return Intent.THANKS;
        }
        if (FAREWELL_WORD.matcher(normalized).find()) {
            return Intent.FAREWELL;
        }
        if (GREETING_WORD.matcher(normalized).find()) {
            return Intent.GREETING;
        }
        return Intent.UNKNOWN;
    }

    /** El saludo con el que conviene contestar ("Buenas noches" si el usuario dijo buenas noches), o null. */
    public static String greetingOf(String message) {
        String normalized = TextNormalizer.normalize(message);
        if (!GREETING_WORD.matcher(normalized).find()) {
            return null;
        }
        if (normalized.contains("buenos dias") || normalized.contains("buen dia")) {
            return "Buenos días";
        }
        if (normalized.contains("buenas tardes")) {
            return "Buenas tardes";
        }
        if (normalized.contains("buenas noches")) {
            return "Buenas noches";
        }
        return "Hola";
    }

    private record ContactLookup(ContactMatch match, List<AiContactDto> contacts) {
    }

    private static ContactLookup findContacts(String normalized, List<AiContactDto> contacts) {
        List<AiContactDto> exact = contacts.stream()
                .filter(contact -> containsWords(normalized, TextNormalizer.normalize(contact.name())))
                .toList();
        // "Ana María" también contiene "Ana": se queda el nombre más largo.
        List<AiContactDto> distinct = exact.stream()
                .filter(contact -> exact.stream().noneMatch(other -> other != contact
                        && TextNormalizer.normalize(other.name()).length() > TextNormalizer.normalize(contact.name()).length()
                        && containsWords(TextNormalizer.normalize(other.name()), TextNormalizer.normalize(contact.name()))))
                .toList();
        if (distinct.size() == 1) {
            return new ContactLookup(ContactMatch.EXACT, distinct);
        }
        if (distinct.size() > 1) {
            return new ContactLookup(ContactMatch.MULTIPLE, distinct);
        }

        List<AiContactDto> partial = contacts.stream()
                .filter(contact -> distinctiveWords(contact).stream().anyMatch(word -> containsWords(normalized, word)))
                .toList();
        if (!partial.isEmpty()) {
            return new ContactLookup(partial.size() == 1 ? ContactMatch.PARTIAL : ContactMatch.AMBIGUOUS, partial);
        }

        List<String> words = Arrays.asList(normalized.split("[^\\p{L}\\p{N}]+"));
        List<AiContactDto> fuzzy = contacts.stream()
                .filter(contact -> distinctiveWords(contact).stream()
                        .anyMatch(name -> words.stream().anyMatch(word -> almostEqual(word, name))))
                .toList();
        if (!fuzzy.isEmpty()) {
            return new ContactLookup(fuzzy.size() == 1 ? ContactMatch.FUZZY : ContactMatch.AMBIGUOUS, fuzzy);
        }
        return new ContactLookup(ContactMatch.NONE, List.of());
    }

    private static List<String> distinctiveWords(AiContactDto contact) {
        List<String> words = new ArrayList<>();
        for (String word : TextNormalizer.normalize(contact.name()).split("[^\\p{L}\\p{N}]+")) {
            if (word.length() >= 3 && !TITLES.contains(word)) {
                words.add(word);
            }
        }
        return words;
    }

    private static boolean containsWords(String text, String words) {
        return !words.isEmpty()
                && Pattern.compile("(^|[^\\p{L}\\p{N}])" + Pattern.quote(words) + "($|[^\\p{L}\\p{N}])").matcher(text).find();
    }

    /**
     * Una letra de diferencia en nombres de 4 letras o más; en los cortos solo una letra repetida ("anna" por
     * "ana"), para que "una" no se confunda con "Ana".
     */
    static boolean almostEqual(String word, String name) {
        if (word.equals(name) || word.isEmpty()) {
            return false;
        }
        if (name.length() < 4) {
            return word.replaceAll("(\\p{L})\\1+", "$1").equals(name);
        }
        return Math.abs(word.length() - name.length()) <= 1 && distance(word, name) <= 1;
    }

    private static int distance(String a, String b) {
        int[] previous = new int[b.length() + 1];
        int[] current = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            previous[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            current[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()];
    }

    private static String memo(String message, ContactLookup lookup) {
        Matcher matcher = MEMO.matcher(message.trim());
        if (!matcher.find()) {
            return null;
        }
        String memo = matcher.group(1).trim().replaceAll("[.!?¡¿]+$", "").replaceAll("\\s+", " ");
        if (memo.isEmpty() || isOnlyContact(memo, lookup)) {
            return null;
        }
        return memo.length() > MAX_MEMO ? memo.substring(0, MAX_MEMO) : memo;
    }

    private static boolean isOnlyContact(String memo, ContactLookup lookup) {
        String normalized = TextNormalizer.normalize(memo);
        return lookup.contacts().stream().anyMatch(contact -> TextNormalizer.normalize(contact.name()).equals(normalized));
    }
}
