��    R      �              <  	   =  	   G     Q     f     }     �     �     �     �  K   �  m   5     �     �     �  	   �  !   �     �     �          #     +     =  >   O  A   �     �     �     �        
   	       )   *     T     Y     ^     p     �     �     �  '   �     �     �     �     �     �     �  
   	     	     -	     6	     F	     W	  
   d	     o	  $   |	     �	     �	     �	     �	     �	     �	     �	  
   
  7   
  /   D
     t
     �
  T   �
     �
     �
     �
     �
  �     >   �  �     T   �  a   9     �     �     �  	   �  
   �  �  �     g     y      �  %   �      �     �          (  $   8  X   ]  m   �     $     7     N     k  *   x  
   �     �     �     �     �     �  <   
  M   G     �     �     �     �     �     �  (        +     9     >     Z     n     �     �  7   �     �  	   �     �  	   �     �     �          $  
   8     C     Q  	   c     m  
   �  &   �     �     �     �     �     �  
             '  I   5  8        �     �  F   �           &     8     =  �   L  B     �   O  I   3  }   }     �               "     1   Add Macro Add Point Add macro button to: Add to existing offset Allows to config klipper Allows to use klipper macros Analyze Klipper Log Analyze Log Assisted Bed Leveling Assists in debugging performance issues by analyzing the Klipper log files. Assists in manually leveling your printbed by moving the head to a configurable set of positions in sequence. Basic Bed Leveling Check parsing on save Clear Log Click labels to hide/show dataset Close Command Configuration Reload Command Connect Coordinate Offset Decrease Fontsize Depending on the size of the log file this might take a while. Determines optimal PID parameters by heat cycling the hotend/bed. Enable debug logging Feedrate X/Y Fill Datasets Firmware Get Status Go to OctoKlipper Tab Heater / Extruder Name (from config file) Home Host Increase Fontsize Klipper Config File Klipper Configuration Klipper Log File Klipper Tab Lift Head by this amount before moving. Macros Messages Name Next OK Open Klipper config PID Tuning Performance Graph Previous Printer Profile Probe Feedrate Z Probe Height Probe Lift Probe Points Query Klipper for its current status Reload from file Reload last changes Replace Connection Panel Restart Run -  Select Serial Port Set Offset Set an offset for all future GCODE move commands in mm. Sets a offset for subsequent GCODE coordinates. Show Short Messages Sidebar Similar to a host restart, but also clears any error state from the micro-controller Start Start Tuning Stop Target Temperature The command that is executed when the Klipper configuration changed and needs to be reloaded.<br>
              Set this to "Manually" if you don't want to immediately restart klipper. The result of the tuning cycle is reported in the message log. This feature assists in manually leveling you print bed by moving the head to the defined points in sequence.<br>
           If you use a piece of paper for leveling, set "Probe Height" to the paper thickness eg. "0.1". This will cause the host software to reload its config and perform an internal reset To show a dialog that asks for parameters you can write your macro like in the following example: Tools Z-height to probe at name on NavBar on SideBar Project-Id-Version: OctoKlipper 0.3.8.2
Report-Msgid-Bugs-To: i18n@octoprint.org
POT-Creation-Date: 2021-05-13 18:15+0200
PO-Revision-Date: 2021-05-13 17:32+0200
Last-Translator: FULL NAME <EMAIL@ADDRESS>
Language: de
Language-Team: de <LL@li.org>
Plural-Forms: nplurals=2; plural=(n != 1)
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 8bit
Generated-By: Babel 2.9.0
 Makro hinzufügen Füge Messpunkt hinzu Makroschaltfläche anzeigen auf: Hinzufügen zum existierenden Versatz Erlaubt Klipper zu konfigurieren Erlaubt Makros zu benutzen Analysiere Klipperlog Log analysieren Unterstützte Druckbett-Nivellierung Unterstützt, mit dem analysieren des Klipperlogs, beim Suchen von Performanceproblemen. Unterstützt beim manuellem Bettnivellieren, <br>
da der Druckkopf nacheinander einstellbare Punkte anfährt. Haupteinstellungen Druckbett-Nivellierung Prüfe Syntax beim speichern Log löschen Auf Labels klicken zum verstecken/anzeigen Schließen Befehl Konfiguration Neustart Befehl Verbinde Koordinaten Versatz Verringere Schriftgröße Abhängig von der Größe der Logdatei kann es etwas dauern. Findet optimale PID Parameter beim zyklischen Heizen des Druckkopfes/-bettes. Aktiviere Debugloging Geschwindigkeit X/Y Fülle Flächen Firmware Statusanfrage Gehe zum OctoKlipper Reiter Heizer / Extruder Name (von Konfigdatei) Grundstellung Host Vergrößere Schriftgröße Klipper Konfigdatei Klipper Konfiguration Klipper Logdatei Klipper Reiter Hebe Druckkopf auf diese Höhe vor einer Seitenbewegung Makros Nachricht Name Nächster OK Öffne Klipper Konfig PID Abstimmung Performancediagramm Vorheriger Druckerprofil Geschwindigkeit Z Messhöhe Höhe für Seitenbewegung Messpunkte Aktuellen Status von Klipper anfordern Datei neuladen Lade letzte Änderung Ersetze Verbindungsmenu Neustart Ausführen -  Auswählen Serieller Port Setze Versatz Setze einen Versatz in mm für alle zukünftigen GCODE Bewegungskommandos Setze einen Versatz für alle weiteren GCODE Koordinaten Zeige Kurzmeldungen Seitenleiste Wie der Host Neustart, aber zusätzlich wird die Firmware neugestartet Start Starte Abstimmung Stop Zieltemperatur Der Befehl der ausgeführt wird nachdem die Klipper Konfiguration <br>
geändert wurde und neu geladen werden muss.<br>
Auf "Manually" setzen wenn man nicht gleich Klipper neustarten möchte. Die Ergebnisse der Abstimmung werden im Nachrichtenlog ausgegeben. Diese Funktion hilft beim Einstellen des Druckbettes, <br>
da es die angegebenen Punkte automatisch nacheinander anfährt.<br>
Wenn man ein Papier zum messen nimmt, setzt man "Messhöhe" <br>
auf die Papierstärke zBsp.: "0.1". Das wird die Konfigurationsdatei neuladen und die Hostsoftware neustarten Um ein Dialog anzeigen zu lassen, welches nach Parametern fragt, <br>
kann man ein Makro wie im nächsten Beispiel schreiben: Tools Höhe bei der gemessen wird Name auf Nav-leiste auf Seitenleiste 