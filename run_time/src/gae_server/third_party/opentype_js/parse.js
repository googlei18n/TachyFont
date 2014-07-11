// part of the opentype.js
// https://github.com/nodebox/opentype.js
// (c) 2014 Frederik De Bleser
// opentype.js may be freely distributed under the MIT license.
/*
The MIT License (MIT)

Copyright (c) 2014 Frederik De Bleser

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/



	// Parsing utility functions ////////////////////////////////////////////

    // Retrieve an unsigned byte from the DataView.
    function getByte(dataView, offset) {
        return dataView.getUint8(offset);
    }

    var getCard8 = getByte;

    // Retrieve an unsigned 16-bit short from the DataView.
    // The value is stored in big endian.
    function getUShort(dataView, offset) {
        return dataView.getUint16(offset, false);
    }

    var getCard16 = getUShort;

    // Retrieve a signed 16-bit short from the DataView.
    // The value is stored in big endian.
    function getShort(dataView, offset) {
        return dataView.getInt16(offset, false);
        var decimal, fraction;
        decimal = dataView.getInt16(offset, false);
        fraction = dataView.getUint16(offset + 2, false);
        return decimal + fraction / 65535;
    }

    // Retrieve an unsigned 32-bit long from the DataView.
    // The value is stored in big endian.
    function getULong(dataView, offset) {
        return dataView.getUint32(offset, false);
    }

    // Retrieve a 32-bit signed fixed-point number (16.16) from the DataView.
    // The value is stored in big endian.
    function getFixed(dataView, offset) {
        var decimal, fraction;
        decimal = dataView.getInt16(offset, false);
        fraction = dataView.getUint16(offset + 2, false);
        return decimal + fraction / 65535;
    }

    // Retrieve a 4-character tag from the DataView.
    // Tags are used to identify tables.
    function getTag(dataView, offset) {
        var tag = '', i;
        for (i = offset; i < offset + 4; i += 1) {
            tag += String.fromCharCode(dataView.getInt8(i));
        }
        return tag;
    }

    // Retrieve an offset from the DataView.
    // Offsets are 1 to 4 bytes in length, depending on the offSize argument.
    function getOffset(dataView, offset, offSize) {
        var i, v;
        v = 0;
        for (i = 0; i < offSize; i += 1) {
            v <<= 8;
            v += dataView.getUint8(offset + i);
        }
        return v;
    }

    // Retrieve a number of bytes from start offset to the end offset from the DataView.
    function getBytes(dataView, startOffset, endOffset) {
        var bytes, i;
        bytes = [];
        for (i = startOffset; i < endOffset; i += 1) {
            bytes.push(dataView.getUint8(i));
        }
        return bytes;
    }

    function setBytes(dataView, startOffset, endOffset, bytes) {
        for (var i = startOffset,j=0; i < endOffset; i += 1,j+=1) {
            dataView.setUint8(i,bytes[j]);
        }
    }

    // Convert the list of bytes to a string.
    function bytesToString(bytes) {
        var s, i;
        s = '';
        for (i = 0; i < bytes.length; i += 1) {
            s += String.fromCharCode(bytes[i]);
        }
        return s;
    }

    var typeOffsets = {
        byte: 1,
        uShort: 2,
        short: 2,
        uLong: 4,
        fixed: 4,
        longDateTime: 8,
        tag: 4
    };

    // A stateful parser that changes the offset whenever a value is retrieved.
    // The data is a DataView.
    function Parser(data, offset) {
        this.data = data;
        this.offset = offset;
        this.relativeOffset = 0;
    }

    Parser.prototype.parseBytes = function (length) {
        var bytes = getBytes(this.data,this.offset+this.relativeOffset,this.offset+this.relativeOffset+length);
	this.relativeOffset += length;
	return bytes;
    };

    Parser.prototype.parseByte = function () {
        var v = this.data.getUint8(this.offset + this.relativeOffset);
        this.relativeOffset += 1;
        return v;
    };

    Parser.prototype.getBytes = function(offset,length){
       return getBytes(this.data,offset,offset+length);
    };

    Parser.prototype.setBytes = function(offset,bytes){
       setBytes(this.data,offset,offset+bytes.length,bytes);
    };

    Parser.prototype.parseChar = function () {
        var v = this.data.getInt8(this.offset + this.relativeOffset);
        this.relativeOffset += 1;
        return v;
    };

    Parser.prototype.parseCard8 = Parser.prototype.parseByte;

    Parser.prototype.parseUShort = function () {
        var v = this.data.getUint16(this.offset + this.relativeOffset);
        this.relativeOffset += 2;
        return v;
    };

    Parser.prototype.writeUShort = function (item) {
        var v = this.data.setUint16(this.offset + this.relativeOffset,item);
        this.relativeOffset += 2;
        return v;
    };

    Parser.prototype.writeUShortByOffset = function (offset,item) {
         this.data.setUint16(offset,item);
    };

    Parser.prototype.parseCard16 = Parser.prototype.parseUShort;
    Parser.prototype.parseSID = Parser.prototype.parseUShort;
    Parser.prototype.parseOffset16 = Parser.prototype.parseUShort;

    Parser.prototype.parseShort = function () {
        var v = this.data.getInt16(this.offset + this.relativeOffset);
        this.relativeOffset += 2;
        return v;
    };

    Parser.prototype.writeShort = function (item) {
         this.data.setInt16(this.offset + this.relativeOffset,item);
         this.relativeOffset += 2;
    };

    Parser.prototype.writeShortByOffset = function (offset,item) {
         this.data.setInt16(offset,item);
    };

    Parser.prototype.parseULong = function () {
        var v = getULong(this.data, this.offset + this.relativeOffset);
        this.relativeOffset += 4;
        return v;
    };

    Parser.prototype.writeULong = function (item) {
        var v = this.data.setUint32(this.offset + this.relativeOffset,item);
        this.relativeOffset += 4;
        return v;
    };

    Parser.prototype.writeULongByOffset = function (offset,item) {
         this.data.setUint32(offset,item);
    };

    Parser.prototype.parseFixed = function () {
        var v = getFixed(this.data, this.offset + this.relativeOffset);
        this.relativeOffset += 4;
        return v;
    };

    Parser.prototype.parseOffset16List = 
    Parser.prototype.parseUShortList = function (count) {
        var offsets = new Array(count),
            dataView = this.data,
            offset = this.offset + this.relativeOffset;
        for (var i = 0; i < count; i++) {
            offsets[i] = getUShort(dataView, offset);
            offset += 2;
        }
        this.relativeOffset += count * 2;
        return offsets;
    };

    Parser.prototype.parseString = function (length) {
        var dataView = this.data,
            offset = this.offset + this.relativeOffset,
            string = '';
        this.relativeOffset += length;
        for (var i = 0; i < length; i++) {
            string += String.fromCharCode(dataView.getUint8(offset + i));
        }
        return string;
    };

    Parser.prototype.parseTag = function () {
        return this.parseString(4);
    };

    // LONGDATETIME is a 64-bit integer.
    // JavaScript and unix timestamps traditionally use 32 bits, so we
    // only take the last 32 bits.
    Parser.prototype.parseLongDateTime = function() {
        var v = getULong(this.data, this.offset + this.relativeOffset + 4);
        this.relativeOffset += 8;
        return v;
    };

    Parser.prototype.parseFixed = function() {
        var v = getULong(this.data, this.offset + this.relativeOffset);
        this.relativeOffset += 4;
        return v / 65536;
    };

    Parser.prototype.parseVersion = function() {
        var major = getUShort(this.data, this.offset + this.relativeOffset);
        // How to interpret the minor version is very vague in the spec. 0x5000 is 5, 0x1000 is 1
        // This returns the correct number if minor = 0xN000 where N is 0-9
        var minor = getUShort(this.data, this.offset + this.relativeOffset + 2);
        this.relativeOffset += 4;
        return major + minor / 0x1000 / 10;
    };

    Parser.prototype.skip = function (type, amount) {
        if (amount === undefined) {
            amount = 1;
        }
        this.relativeOffset += typeOffsets[type] * amount;
    };  

   Parser.prototype.writeHmtx = function(font){
	writeHmtxTable(this.data, font.hmtxOffset, font.numberOfHMetrics, font.numGlyphs, font.metrics) 
   };

    Parser.prototype.writeLoca = function(font){
        writeLocaTable(this.data, font.locaOffset, font.numGlyphs, font.indexToLocFormat === 0, font.loca);
    };

    // Precondition function that checks if the given predicate is true.
    // If not, it will log an error message to the console.
    function checkArgument(predicate, message) {
        if (!predicate) {
            throw new Error(message);
        }
    }


    function Font() {
        this.supported = true;
        this.glyphs = [];
        this.encoding = null;
        this.tables = {};
    }

    // Parse the maximum profile `maxp` table
    // https://www.microsoft.com/typography/OTSPEC/maxp.htm
    function parseMaxpTable(data, start) {
        var maxp = {},
            p = new Parser(data, start);
        maxp.version = p.parseVersion();
        maxp.numGlyphs = p.parseUShort();
        if (maxp.majorVersion === 1) {
            maxp.maxPoints = p.parseUShort();
            maxp.maxContours = p.parseUShort();
            maxp.maxCompositePoints = p.parseUShort();
            maxp.maxCompositeContours = p.parseUShort();
            maxp.maxZones = p.parseUShort();
            maxp.maxTwilightPoints = p.parseUShort();
            maxp.maxStorage = p.parseUShort();
            maxp.maxFunctionDefs = p.parseUShort();
            maxp.maxInstructionDefs = p.parseUShort();
            maxp.maxStackElements = p.parseUShort();
            maxp.maxSizeOfInstructions = p.parseUShort();
            maxp.maxComponentElements = p.parseUShort();
            maxp.maxComponentDepth = p.parseUShort();
        }
        return maxp;
    }



    // Parse the horizontal header `hhea` table
    // https://www.microsoft.com/typography/OTSPEC/hhea.htm
    function parseHheaTable(data, start) {
        var hhea = {},
            p = new Parser(data, start);
        hhea.version = p.parseVersion();
        hhea.ascender = p.parseShort();
        hhea.descender = p.parseShort();
        hhea.lineGap = p.parseShort();
        hhea.advanceWidthMax = p.parseUShort();
        hhea.minLeftSideBearing = p.parseShort();
        hhea.minRightSideBearing = p.parseShort();
        hhea.xMaxExtent = p.parseShort();
        hhea.caretSlopeRise = p.parseShort();
        hhea.caretSlopeRun = p.parseShort();
        hhea.caretOffset = p.parseShort();
        p.relativeOffset += 8;
        hhea.metricDataFormat = p.parseShort();
        hhea.numberOfHMetrics = p.parseUShort();
        return hhea;
    }

    // Parse the `hmtx` table, which contains the horizontal metrics for all glyphs.
    // This function augments the glyph array, adding the advanceWidth and leftSideBearing to each glyph.
    // https://www.microsoft.com/typography/OTSPEC/hmtx.htm
    function parseHmtxTable(data, start, numMetrics, numGlyphs) {
        var p, i, glyph, advanceWidth, leftSideBearing , table = [];
        p = new Parser(data, start);
        for (i = 0; i < numGlyphs; i += 1) {
            // If the font is monospaced, only one entry is needed. This last entry applies to all subsequent glyphs.
            if (i < numMetrics) {
                advanceWidth = p.parseUShort();
                leftSideBearing = p.parseShort();
            }else{
		leftSideBearing = p.parseShort();
	   }
            
	    table.push( [advanceWidth,leftSideBearing] );
        }
	return table;
    }

    function writeHmtxTable(data, start, numMetrics, numGlyphs, table) {
        var p, i;
        p = new Parser(data, start);
        for (i = 0; i < numGlyphs; i += 1) {
            // If the font is monospaced, only one entry is needed. This last entry applies to all subsequent glyphs.
            if (i < numMetrics) {
                p.writeUShort(table[i][0]);
                p.writeShort(table[i][1]);
            }else{
		p.writeShort(table[i][1]);
	   }        
        }
    }

    function parseVmtxTable(data, start, numMetrics, numGlyphs) {
        var p, i, glyph, advanceWidth, leftSideBearing , table = [];
        p = new Parser(data, start);
        for (i = 0; i < numGlyphs; i += 1) {
            // If the font is monospaced, only one entry is needed. This last entry applies to all subsequent glyphs.
            if (i < numMetrics) {
                advanceWidth = p.parseUShort();
                topSideBearing = p.parseShort();
            }else{
        leftSideBearing = p.parseShort();
       }
            
        table.push( [advanceWidth,topSideBearing] );
        }
    return table;
    }

    function writeVmtxTable(data, start, numMetrics, numGlyphs, table) {
        var p, i;
        p = new Parser(data, start);
        for (i = 0; i < numGlyphs; i += 1) {
            // If the font is monospaced, only one entry is needed. This last entry applies to all subsequent glyphs.
            if (i < numMetrics) {
                p.writeUShort(table[i][0]);
                p.writeShort(table[i][1]);
            }else{
        p.writeShort(table[i][1]);
       }        
        }
    }

    // Parse the `loca` table. This table stores the offsets to the locations of the glyphs in the font,
    // relative to the beginning of the glyphData table.
    // The number of glyphs stored in the `loca` table is specified in the `maxp` table (under numGlyphs)
    // The loca table has two versions: a short version where offsets are stored as uShorts, and a long
    // version where offsets are stored as uLongs. The `head` table specifies which version to use
    // (under indexToLocFormat).
    // https://www.microsoft.com/typography/OTSPEC/loca.htm
    function parseLocaTable(data, start, numGlyphs, shortVersion) {
        var p, parseFn, glyphOffsets, glyphOffset, i;
        p = new Parser(data, start);
        parseFn = shortVersion ? p.parseUShort : p.parseULong;
        // There is an extra entry after the last index element to compute the length of the last glyph.
        // That's why we use numGlyphs + 1.
        glyphOffsets = [];
        for (i = 0; i < numGlyphs + 1; i += 1) {
            glyphOffset = parseFn.call(p);
            if (shortVersion) {
                // The short table version stores the actual offset divided by 2.
                glyphOffset *= 2;
            }
            glyphOffsets.push(glyphOffset);
        }
        return glyphOffsets;
    }


        // Parse the `loca` table. This table stores the offsets to the locations of the glyphs in the font,
    // relative to the beginning of the glyphData table.
    // The number of glyphs stored in the `loca` table is specified in the `maxp` table (under numGlyphs)
    // The loca table has two versions: a short version where offsets are stored as uShorts, and a long
    // version where offsets are stored as uLongs. The `head` table specifies which version to use
    // (under indexToLocFormat).
    // https://www.microsoft.com/typography/OTSPEC/loca.htm
    function writeLocaTable(data, start, numGlyphs, shortVersion,glyphOffsets) {
        var p, writeFn,  glyphOffset, i;
        p = new Parser(data, start);
        writeFn = shortVersion ? p.writeUShort : p.writeULong;
        // There is an extra entry after the last index element to compute the length of the last glyph.
        // That's why we use numGlyphs + 1.
        for (i = 0; i <= numGlyphs ; i += 1) {
            glyphOffset = glyphOffsets[i];
            if (shortVersion) {
                // The short table version stores the actual offset divided by 2.
                glyphOffset /= 2;
            }
            writeFn.call(p,glyphOffset);
        }
    }

   // Parse the header `head` table
    // https://www.microsoft.com/typography/OTSPEC/head.htm
    function parseHeadTable(data, start) {
        var head = {},
            p = new Parser(data, start);
        head.version = p.parseVersion();
        head.fontRevision = Math.round(p.parseFixed() * 1000) / 1000;
        head.checkSumAdjustment = p.parseULong();
        head.magicNumber = p.parseULong();
        checkArgument(head.magicNumber === 0x5F0F3CF5, 'Font header has wrong magic number.');
        head.flags = p.parseUShort();
        head.unitsPerEm = p.parseUShort();
        head.created = p.parseLongDateTime();
        head.modified = p.parseLongDateTime();
        head.xMin = p.parseShort();
        head.yMin = p.parseShort();
        head.xMax = p.parseShort();
        head.yMax = p.parseShort();
        head.macStyle = p.parseUShort();
        head.lowestRecPPEM = p.parseUShort();
        head.fontDirectionHint = p.parseShort();
        head.indexToLocFormat = p.parseShort();     // 50
        head.glyphDataFormat = p.parseShort();
        return head;
    }




    function parseFont(buffer) {
        var font, data, version, numTables, i, p, tag, offset, hmtxOffset, glyfOffset, locaOffset,
            cffOffset, kernOffset, gposOffset, indexToLocFormat, numGlyphs, loca,
            shortVersion;
        // OpenType fonts use big endian byte ordering.
        // We can't rely on typed array view types, because they operate with the endianness of the host computer.
        // Instead we use DataViews where we can specify endianness.

        font = new Font();
        data = new DataView(buffer, 0);

        version = getFixed(data, 0);
        if (version === 1.0) {
            font.outlinesFormat = 'truetype';
        } else {
            version = getTag(data, 0);
            if (version === 'OTTO') {
                font.outlinesFormat = 'cff';
            } else {
                throw new Error('Unsupported OpenType version ' + version);
            }
        }

        numTables = getUShort(data, 4);

        // Offset into the table records.
        p = 12;
        for (i = 0; i < numTables; i += 1) {
            tag = getTag(data, p);
            offset = getULong(data, p + 8);
            switch (tag) {
            case 'cmap':
                break;
            case 'head':
                font.tables.head = parseHeadTable(data, offset);
                font.indexToLocFormat = font.tables.head.indexToLocFormat;
                break;
            case 'hhea':
                font.tables.hhea = parseHheaTable(data, offset);
                font.ascender = font.tables.hhea.ascender;
                font.descender = font.tables.hhea.descender;
                font.numberOfHMetrics = font.tables.hhea.numberOfHMetrics;
                break;
            case 'hmtx':
                font.hmtxOffset = offset;
                break;
            case 'maxp':
                font.tables.maxp = parseMaxpTable(data, offset);
                font.numGlyphs = numGlyphs = font.tables.maxp.numGlyphs;
                break;
            case 'name':
                break;
            case 'OS/2':
                break;
            case 'post':
                break;
            case 'glyf':
                font.glyfOffset = offset;
                break;
            case 'loca':
                font.locaOffset = offset;
                break;
            case 'CFF ':
                font.cffOffset = offset;
                break;
            case 'kern':
                kernOffset = offset;
                break;
            case 'GPOS':
                gposOffset = offset;
                break;
            }
            p += 16;
        }



        if (font.glyfOffset && font.locaOffset && font.hmtxOffset) {
	       font.loca = parseLocaTable(data, font.locaOffset, font.numGlyphs, font.indexToLocFormat === 0);
            font.metrics = parseHmtxTable(data, font.hmtxOffset, font.numberOfHMetrics, font.numGlyphs);
        } else if (font.cffOffset && font.hmtxOffset) {
            font.metrics = parseHmtxTable(data, font.hmtxOffset, font.numberOfHMetrics, font.numGlyphs);
           // parseCFFTable(data, cffOffset, font);
        } else {
            font.supported = false;
        }


        return font;
    };






 
