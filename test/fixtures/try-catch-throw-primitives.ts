declare function print(value: unknown): void;
try { throw "message"; } catch (e) { print(e); }
try { throw 42; } catch (e) { print(e); }
try { throw true; } catch (e) { print(e); }
try { throw null; } catch (e) { print(e); }
try { throw undefined; } catch (e) { print(e); }
