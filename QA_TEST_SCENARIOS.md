# QA Test Scenarios: Voice State Management During Backend Search

## 🎯 Issue Fixed
**Problem:** UI incorrectly displayed "Listening..." instead of "Searching..." when AI was performing backend searches via `search_techjays_knowledge` function.

**Root Cause:** Race condition where `response.done` handler reset state to "listening" before function call completed.

**Solution:** Added `isFunctionCallInProgressRef` flag to prevent premature state resets.

---

## 🧪 Test Scenarios

### Test Case 1: Basic Backend Search Flow
**Objective:** Verify state displays "Searching..." during backend search

**Steps:**
1. Start voice session
2. Wait for greeting
3. Ask: "What clients do you work with?"
4. Observe state changes

**Expected Results:**
- ✅ AI responds: "Great question! Let me pull that up for you..."
- ✅ State shows: "Searching..." (NOT "Listening...")
- ✅ Backend search executes
- ✅ AI provides search results
- ✅ State returns to: "Listening..."

**Code Path:**
```
voiceState transitions:
"speaking" → "processing" (Searching...) → "speaking" → "listening"
```

---

### Test Case 2: Multiple Rapid Searches
**Objective:** Test flag management during consecutive function calls

**Steps:**
1. Ask: "What clients do you work with?"
2. Wait for response
3. Immediately ask: "Tell me about Bracketology project"
4. Wait for response
5. Ask: "What about Sony project?"

**Expected Results:**
- ✅ Each search shows "Searching..." (never "Listening..." during search)
- ✅ Flag properly resets between searches
- ✅ No state leakage between function calls

---

### Test Case 3: Search with Error Handling
**Objective:** Verify flag resets on error

**Steps:**
1. Simulate network error (disconnect WiFi temporarily)
2. Ask a question requiring backend search
3. Observe error handling

**Expected Results:**
- ✅ Shows "Searching..."
- ✅ Error occurs
- ✅ Flag resets (`isFunctionCallInProgressRef = false` at L1213)
- ✅ Error message displayed
- ✅ State recovers to "listening"

**Code Reference:** LiveVoiceMode.jsx:1201-1214

---

### Test Case 4: User Interrupts During Search
**Objective:** Verify flag resets on interrupt

**Steps:**
1. Ask question requiring backend search
2. While "Searching..." is displayed, start speaking (trigger VAD)
3. Observe interrupt handling

**Expected Results:**
- ✅ Shows "Searching..."
- ✅ User speech detected
- ✅ Agent interrupted
- ✅ Flag resets (`isFunctionCallInProgressRef.current = false` at L484)
- ✅ State changes to "listening"

**Code Reference:** LiveVoiceMode.jsx:476-492 (interruptAgent function)

---

### Test Case 5: Instant Knowledge Questions (No Search)
**Objective:** Verify flag not affected by non-search questions

**Steps:**
1. Ask: "Who is the CEO?"
2. Ask: "Where is Techjays located?"
3. Ask: "What services do you offer?"

**Expected Results:**
- ✅ AI answers immediately from instant knowledge
- ✅ NO "Searching..." state shown
- ✅ `isFunctionCallInProgressRef` remains `false`
- ✅ State: "speaking" → "listening"

---

### Test Case 6: Mixed Questions (Search + Instant Knowledge)
**Objective:** Test alternating between search and non-search questions

**Steps:**
1. Ask instant knowledge: "Who is the CEO?" (no search)
2. Ask search required: "What clients do you have?" (search)
3. Ask instant knowledge: "What is RAG?" (no search)
4. Ask search required: "Tell me about Bracketology" (search)

**Expected Results:**
- ✅ Question 1: No "Searching...", direct answer
- ✅ Question 2: Shows "Searching...", backend called
- ✅ Question 3: No "Searching...", direct answer
- ✅ Question 4: Shows "Searching...", backend called
- ✅ Flag properly managed throughout

---

### Test Case 7: Session End During Search
**Objective:** Verify cleanup resets flag

**Steps:**
1. Ask question requiring backend search
2. While "Searching..." is displayed, click "End Session"

**Expected Results:**
- ✅ Session ends gracefully
- ✅ Flag resets in cleanup (`isFunctionCallInProgressRef.current = false` at L1306)
- ✅ All resources cleaned up
- ✅ No memory leaks

**Code Reference:** LiveVoiceMode.jsx:1298-1307 (cleanup function)

---

### Test Case 8: Connection Lost During Search
**Objective:** Test recovery when connection drops mid-search

**Steps:**
1. Ask question requiring backend search
2. Simulate connection loss (kill network)
3. Observe reconnection behavior

**Expected Results:**
- ✅ Shows "Searching..."
- ✅ Connection lost detected
- ✅ Flag resets on cleanup
- ✅ Reconnection attempted
- ✅ State recovers properly

---

### Test Case 9: Greeting with No Search
**Objective:** Verify initial connection doesn't affect flag

**Steps:**
1. Start voice session
2. Observe greeting

**Expected Results:**
- ✅ Greeting plays
- ✅ No "Searching..." shown
- ✅ `isFunctionCallInProgressRef` remains `false`
- ✅ State: "connecting" → "speaking" → "listening"

---

### Test Case 10: Long Search Duration
**Objective:** Test state consistency during extended search

**Steps:**
1. Ask complex question requiring extensive search
2. Observe UI during 5-10 second search

**Expected Results:**
- ✅ "Searching..." displayed continuously
- ✅ No flickering to "Listening..."
- ✅ Flag remains `true` throughout search
- ✅ Only resets when new response created

---

## 🔍 Code Review Checklist

### Flag Lifecycle Management
- [x] **Set to `true`:** Line 1105 - when function_call_arguments.delta fires
- [x] **Reset to `false`:** Line 1007 - when new response created
- [x] **Reset on interrupt:** Line 484 - in interruptAgent function
- [x] **Reset on error:** Line 1213 - in error handler
- [x] **Reset on cleanup:** Line 1306 - in cleanup function

### State Transition Guard
- [x] **Line 1164-1167:** Checks `!isFunctionCallInProgressRef.current` before state reset
- [x] **Prevents:** "Listening..." from showing during active function call

### Edge Cases Handled
- [x] Multiple consecutive searches
- [x] Search interrupted by user
- [x] Network errors during search
- [x] Connection lost during search
- [x] Session ended during search

---

## 🎨 Visual State Indicators

| State | Display Text | Orb Animation | When It Should Show |
|-------|--------------|---------------|---------------------|
| `connecting` | "Connecting..." | Spinning | Initial connection |
| `listening` | "Listening..." | Pulse | Ready for user input |
| `processing` | "Searching..." | Spinning | **Backend search in progress** |
| `speaking` | "" | Speaking bars | AI is talking |

---

## 🐛 Regression Testing

### Previously Working Scenarios (Verify Still Work)
- [x] Normal conversation flow
- [x] User interruptions
- [x] Microphone permissions
- [x] Audio playback
- [x] Transcript display
- [x] Message history
- [x] Session reconnection
- [x] Error recovery

---

## 📊 Metrics to Monitor

1. **State Accuracy:** No "Listening..." during search (100% target)
2. **Flag Reset Rate:** Flag properly reset after each function call (100% target)
3. **UI Consistency:** No flashing/flickering states
4. **Performance:** No added latency from flag checks (<1ms)
5. **Memory:** No flag-related memory leaks

---

## 🚀 Deployment Checklist

- [x] Build succeeds without errors
- [x] TypeScript compilation passes
- [ ] Manual testing in staging environment
- [ ] Verify on mobile devices
- [ ] Test with slow network connections
- [ ] Verify with multiple concurrent users
- [ ] Check browser console for errors
- [ ] Validate WebSocket connection stability

---

## 📝 Notes for QA Team

**Key Areas to Focus:**
1. **Timing:** The race condition happened in a ~300ms window. Test rapidly.
2. **Network:** Test with variable network conditions (slow, intermittent).
3. **Interrupts:** Try interrupting at different points during search.
4. **Edge Cases:** Multiple searches, errors, disconnects.

**Tools Recommended:**
- Chrome DevTools (Network tab - throttle to "Slow 3G")
- React DevTools (monitor state changes)
- Browser console (watch for WebSocket events)

**Success Criteria:**
- ✅ NEVER see "Listening..." when function call is in progress
- ✅ ALWAYS see "Searching..." during backend searches
- ✅ Smooth transitions with no flickering
- ✅ Proper state recovery on errors/interrupts

---

## 🔗 Related Files
- `src/components/LiveVoiceMode.jsx` - Main component with fix
- `src/components/voiceSessionConfig.js` - Session and function config
- `src/components/voiceAudioUtils.js` - Audio utilities

---

## 📞 Contact
If issues are found, provide:
1. Browser and version
2. Exact steps to reproduce
3. Expected vs actual behavior
4. Browser console logs
5. Network conditions during test
